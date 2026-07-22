/**
 * Course Visibility Checker
 *
 * Determines whether a user can access a course based on visibility rules.
 *
 * Rules:
 *   isPublished=false → hidden from everyone
 *   isPublished=true + no restrictions → visible to all
 *   isPublished=true + restrictions → role IN visibilityRoles OR id IN visibilityUsers
 */

import type { Prisma } from '@prisma/client';

interface VisibilityStage {
  isPublished: boolean;
  visibilityRoles?: string | null;
  visibilityUsers?: string | null;
}

interface VisibilityUser {
  id: string;
  role: string;
}

/**
 * Parse a JSON string field into a string array, returning [] on failure.
 */
function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Check if a specific user can access a specific course.
 */
export function checkCourseVisibility(stage: VisibilityStage, user: VisibilityUser): boolean {
  // Not published → nobody can see it
  if (!stage.isPublished) return false;

  const roles = parseJsonArray(stage.visibilityRoles);
  const users = parseJsonArray(stage.visibilityUsers);

  // No restrictions → visible to all
  if (roles.length === 0 && users.length === 0) return true;

  // Check role match
  if (roles.length > 0 && roles.includes(user.role)) return true;

  // Check user match
  if (users.length > 0 && users.includes(user.id)) return true;

  return false;
}

/**
 * Build Prisma WHERE clause that filters courses by visibility for a given user.
 * Used by discover API to exclude courses the user cannot see.
 *
 * For unauthenticated users (user=null), only returns publicly visible courses
 * (published + no restrictions).
 */
export function buildVisibilityWhereClause(
  user: VisibilityUser | null,
): Prisma.StageWhereInput {
  const basePublished: Prisma.StageWhereInput = { isPublished: true };

  if (!user) {
    // Unauthenticated: only courses with NO restrictions
    return {
      ...basePublished,
      OR: [
        { visibilityRoles: null, visibilityUsers: null },
        { visibilityRoles: '[]', visibilityUsers: null },
        { visibilityRoles: null, visibilityUsers: '[]' },
        { visibilityRoles: '[]', visibilityUsers: '[]' },
      ],
    };
  }

  // Admin can see all courses (published and unpublished)
  if (user.role === 'admin') return {};

  // For authenticated users: published AND (no restrictions OR role match OR user match)
  // JSON text column matching uses LIKE for role/user inclusion
  return {
    ...basePublished,
    OR: [
      // No restrictions at all
      {
        AND: [
          { OR: [{ visibilityRoles: null }, { visibilityRoles: '[]' }] },
          { OR: [{ visibilityUsers: null }, { visibilityUsers: '[]' }] },
        ],
      },
      // Role matches (JSON text contains the role string)
      { visibilityRoles: { contains: `"${user.role}"` } },
      // User ID matches (JSON text contains the user ID)
      { visibilityUsers: { contains: `"${user.id}"` } },
    ],
  };
}
