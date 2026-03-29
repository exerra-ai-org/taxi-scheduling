export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
export const JWT_COOKIE_NAME = "token";
export const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const LONDON_ZONE_PATTERN = /london/i;
