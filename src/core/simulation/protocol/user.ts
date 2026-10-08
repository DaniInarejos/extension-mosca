export const USER_ROLES = ['mosca', 'mosca-guardia', 'rey-mosca'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const DEFAULT_USER_ROLE: UserRole = 'mosca';
