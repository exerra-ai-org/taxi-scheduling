/**
 * Pure login decision logic.
 *
 * Customers without a password hash can only authenticate via magic link —
 * phone numbers are NOT a credential. This avoids the prior policy where
 * email + phone were sufficient to take over a customer account.
 */
export type LoginOutcome =
  | { kind: "magic_link_required" }
  | { kind: "password_required" }
  | { kind: "verify_password"; passwordHash: string; password: string };

export function decideLoginAttempt(
  user: { passwordHash: string | null; phone?: string | null },
  password: string | undefined,
): LoginOutcome {
  if (!user.passwordHash) {
    return { kind: "magic_link_required" };
  }
  if (!password) {
    return { kind: "password_required" };
  }
  return {
    kind: "verify_password",
    passwordHash: user.passwordHash,
    password,
  };
}
