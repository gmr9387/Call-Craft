import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { classById, db } from "./db.js";
import { MIN_PASSWORD, type LinkInfo, type Me, type Person, type Role } from "../shared/accounts.js";

// Accounts, sessions, and one-time links (invites and password resets).
// Sessions are an httpOnly cookie holding a random token; only its SHA-256 is stored.

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const SESSION_COOKIE = "cc_session";
const SESSION_DAYS = 30;
const LINK_DAYS = 7;

// A missing or expired sign-in (401), or a signed-in person without access (403).
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

// A problem with what the person typed, shown to them as is (400).
export class AccountInputError extends Error {}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  classId: string | null;
}

// ---- Passwords ----

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

// Stands in for a real hash when the email isn't found, so both cases take the same time.
let dummyHash: Promise<string> | undefined;

// ---- Input checks ----

export function cleanEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountInputError("Enter a valid email address.");
  }
  return email;
}

export function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120) throw new AccountInputError("Enter your first and last name.");
  return name;
}

export function cleanPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < MIN_PASSWORD) {
    throw new AccountInputError(`Use a password with at least ${MIN_PASSWORD} characters.`);
  }
  if (password.length > 200) throw new AccountInputError("That password is too long.");
  return password;
}

// ---- Tokens and cookies ----

const newToken = () => randomBytes(32).toString("base64url");
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function cookie(request: Request, value: string, maxAgeSec: number): string {
  // Secure everywhere except plain-http local development.
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export const clearSessionCookie = (request: Request) => cookie(request, "", 0);

// ---- Users ----

function toUser(r: { id: string; name: string; email: string; role: Role; class_id: string | null }): User {
  return { id: r.id, name: r.name, email: r.email, role: r.role, classId: r.class_id };
}

export async function toMe(user: User): Promise<Me> {
  const cls = user.role === "agent" && user.classId ? await classById(user.classId) : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    classInfo: cls ? { id: cls.id, name: cls.name, classCode: cls.classCode } : null,
  };
}

export async function needsSetup(): Promise<boolean> {
  const [{ exists }] = await db()`select exists (select 1 from users) as exists`;
  return !exists;
}

const EMAIL_TAKEN = "An account with that email already exists. Sign in instead, or ask your trainer for a reset link.";

async function insertUser(
  fields: { email: string; name: string; role: Role; password: string; classId?: string | null },
  onlyIfFirst = false,
): Promise<User | null> {
  const hash = await hashPassword(fields.password);
  try {
    const rows = onlyIfFirst
      ? await db()`
          insert into users (email, name, role, password_hash)
          select ${fields.email}, ${fields.name}, ${fields.role}, ${hash}
          where not exists (select 1 from users)
          returning id, name, email, role, class_id
        `
      : await db()`
          insert into users (email, name, role, password_hash, class_id)
          values (${fields.email}, ${fields.name}, ${fields.role}, ${hash}, ${fields.classId ?? null})
          returning id, name, email, role, class_id
        `;
    return rows[0] ? toUser(rows[0] as never) : null;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AccountInputError(EMAIL_TAKEN);
    throw error;
  }
}

// The very first account on a new deployment becomes the admin. Returns null once any account exists.
export function createFirstAdmin(fields: { email: string; name: string; password: string }): Promise<User | null> {
  return insertUser({ ...fields, role: "admin" }, true);
}

export async function createAgent(fields: {
  email: string;
  name: string;
  password: string;
  classId: string;
}): Promise<User> {
  return (await insertUser({ ...fields, role: "agent" }))!;
}

// Returns the user when the email and password match an active account.
export async function checkLogin(email: string, password: string): Promise<User | null> {
  const rows = await db()`
    select id, name, email, role, class_id, password_hash, disabled from users where email = ${email}
  `;
  const row = rows[0];
  if (!row) {
    dummyHash ??= hashPassword("not a real password");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  const ok = await verifyPassword(password, row.password_hash);
  return ok && !row.disabled ? toUser(row as never) : null;
}

export async function userById(id: string): Promise<User | null> {
  const rows = await db()`select id, name, email, role, class_id from users where id = ${id}`;
  return rows[0] ? toUser(rows[0] as never) : null;
}

export async function changePassword(userId: string, current: string, next: string): Promise<boolean> {
  const rows = await db()`select password_hash from users where id = ${userId}`;
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) return false;
  await db()`update users set password_hash = ${await hashPassword(next)} where id = ${userId}`;
  return true;
}

export async function listPeople(): Promise<Person[]> {
  const rows = await db()`
    select u.id, u.name, u.email, u.role, u.disabled, u.created_at, u.last_seen_at, c.name as class_name
    from users u
    left join classes c on c.id = u.class_id
    order by case u.role when 'admin' then 0 when 'trainer' then 1 else 2 end, u.name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    className: r.class_name ?? null,
    disabled: r.disabled,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
  }));
}

export async function updatePerson(userId: string, fields: { name: string; email: string }): Promise<boolean> {
  try {
    const rows = await db()`
      update users set name = ${fields.name}, email = ${fields.email} where id = ${userId} returning id
    `;
    return rows.length > 0;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new AccountInputError("Another account already uses that email.");
    }
    throw error;
  }
}

// Turning an account off also signs it out everywhere.
export async function setDisabled(userId: string, disabled: boolean): Promise<boolean> {
  const rows = await db()`update users set disabled = ${disabled} where id = ${userId} returning id`;
  if (disabled) await db()`delete from sessions where user_id = ${userId}`;
  return rows.length > 0;
}

// ---- Sessions ----

// Starts a session and returns the Set-Cookie header value.
export async function startSession(request: Request, userId: string): Promise<string> {
  const token = newToken();
  await db()`
    insert into sessions (token_hash, user_id, expires_at)
    values (${tokenHash(token)}, ${userId}, now() + ${`${SESSION_DAYS} days`}::interval)
  `;
  // Occasionally clear out expired sessions.
  if (Math.random() < 0.05) await db()`delete from sessions where expires_at < now()`;
  return cookie(request, token, SESSION_DAYS * 24 * 60 * 60);
}

export async function endSession(request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await db()`delete from sessions where token_hash = ${tokenHash(token)}`;
}

// The signed-in user, or null. Never throws for a missing or stale cookie.
export async function currentUser(request: Request): Promise<User | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await db()`
    select u.id, u.name, u.email, u.role, u.class_id, u.last_seen_at
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash(token)} and s.expires_at > now() and not u.disabled
  `;
  const row = rows[0];
  if (!row) return null;
  // Track "last active" for rosters, at most once an hour per person.
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at).getTime() > 60 * 60 * 1000) {
    await db()`update users set last_seen_at = now() where id = ${row.id}`;
  }
  return toUser(row as never);
}

// The signed-in user, required to have one of these roles (any role when none are given).
export async function requireUser(request: Request, ...roles: Role[]): Promise<User> {
  const user = await currentUser(request);
  if (!user) throw new AuthError("Please sign in again.", 401);
  if (roles.length && !roles.includes(user.role)) throw new AuthError("You don't have access to that.", 403);
  return user;
}

// Admins can manage every class; trainers only the classes they run.
export async function canManageClass(user: User, classId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.role !== "trainer") return false;
  const cls = await classById(classId);
  return cls?.trainerId === user.id;
}

// ---- One-time links ----

export async function createInvite(createdBy: string, role: "admin" | "trainer"): Promise<string> {
  const token = newToken();
  await db()`
    insert into account_links (token_hash, kind, role, created_by, expires_at)
    values (${tokenHash(token)}, 'invite', ${role}, ${createdBy}, now() + ${`${LINK_DAYS} days`}::interval)
  `;
  return token;
}

export async function createResetLink(createdBy: string, userId: string): Promise<string> {
  const token = newToken();
  // A new reset link replaces any older unused one for the same person.
  await db()`delete from account_links where kind = 'reset' and user_id = ${userId} and used_at is null`;
  await db()`
    insert into account_links (token_hash, kind, user_id, created_by, expires_at)
    values (${tokenHash(token)}, 'reset', ${userId}, ${createdBy}, now() + ${`${LINK_DAYS} days`}::interval)
  `;
  return token;
}

export async function linkInfo(token: string): Promise<LinkInfo | null> {
  const rows = await db()`
    select l.kind, l.role, u.name, u.email
    from account_links l
    left join users u on u.id = l.user_id
    where l.token_hash = ${tokenHash(token)} and l.used_at is null and l.expires_at > now()
  `;
  const r = rows[0];
  if (!r) return null;
  return { kind: r.kind, role: r.role ?? null, name: r.name ?? null, email: r.email ?? null };
}

const LINK_USED = "This link has expired or was already used. Ask for a new one.";

// Creates the invited account and marks the link used, in one transaction.
export async function acceptInvite(
  token: string,
  fields: { email: string; name: string; password: string },
): Promise<User> {
  const hash = await hashPassword(fields.password);
  try {
    return await db().begin(async (tx) => {
      const links = await tx`
        update account_links set used_at = now()
        where token_hash = ${tokenHash(token)} and kind = 'invite' and used_at is null and expires_at > now()
        returning role
      `;
      if (!links[0]) throw new AccountInputError(LINK_USED);
      const rows = await tx`
        insert into users (email, name, role, password_hash)
        values (${fields.email}, ${fields.name}, ${links[0].role}, ${hash})
        returning id, name, email, role, class_id
      `;
      return toUser(rows[0] as never);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new AccountInputError(EMAIL_TAKEN);
    throw error;
  }
}

// Sets a new password from a reset link and signs the person out of other browsers.
export async function resetPassword(token: string, password: string): Promise<User> {
  const hash = await hashPassword(password);
  return db().begin(async (tx) => {
    const links = await tx`
      update account_links set used_at = now()
      where token_hash = ${tokenHash(token)} and kind = 'reset' and used_at is null and expires_at > now()
      returning user_id
    `;
    if (!links[0]?.user_id) throw new AccountInputError(LINK_USED);
    const rows = await tx`
      update users set password_hash = ${hash} where id = ${links[0].user_id}
      returning id, name, email, role, class_id
    `;
    await tx`delete from sessions where user_id = ${links[0].user_id}`;
    return toUser(rows[0] as never);
  });
}
