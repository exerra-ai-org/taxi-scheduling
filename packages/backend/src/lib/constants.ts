import { config } from "../config";

export const JWT_SECRET = config.jwt.secret;
export const JWT_COOKIE_NAME = config.jwt.cookieName;
export const JWT_EXPIRES_IN_SECONDS = config.jwt.expiresInSeconds;
export const LONDON_ZONE_PATTERN = /london/i;
