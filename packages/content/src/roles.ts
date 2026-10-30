import { z } from 'zod';

export const roleSchema = z.object({
  id: z.string(),
  title: z.string(),
  gets: z.string(),
  typicalHolder: z.string(),
  /** Steward is the one role the owner must turn on; everyone else is available from the start. */
  onByDefault: z.boolean(),
});
export type Role = z.infer<typeof roleSchema>;

/** The six roles from spec section 12. A villager's role decides which real-work tools they have (spec section 7). */
export const ROLES = [
  {
    id: 'villager',
    title: 'Villager',
    gets: 'Game actions: talk, gift, post on the board, visit, remember, promise, request_work',
    typicalHolder: 'Everyone',
    onByDefault: true,
  },
  {
    id: 'mayor',
    title: 'Mayor',
    gets: 'Governance: propose hire, propose building, call a meeting or vote, accept orders, read and add calendar events, draft emails',
    typicalHolder: 'The Mayor',
    onByDefault: true,
  },
  {
    id: 'librarian',
    title: 'Librarian',
    gets: 'Web search, fetch a page, research, write documents to the library',
    typicalHolder: 'The teacher, or a curious villager',
    onByDefault: true,
  },
  {
    id: 'clerk',
    title: 'Clerk',
    gets: 'Read, write and organise files in the work folder; make documents',
    typicalHolder: 'Any villager the owner trusts',
    onByDefault: true,
  },
  {
    id: 'postmaster',
    title: 'Postmaster',
    gets: 'Read mail summaries, draft replies, sort and label mail',
    typicalHolder: 'The postmaster',
    onByDefault: true,
  },
  {
    id: 'steward',
    title: 'Steward',
    gets: 'Run allow-listed commands; files outside the work folder, with approval each time',
    typicalHolder: 'Nobody until the owner turns it on',
    onByDefault: false,
  },
] as const satisfies readonly Role[];

export const rolesTableSchema = z.array(roleSchema);
rolesTableSchema.parse(ROLES);

export type RoleId = (typeof ROLES)[number]['id'];

const ROLES_BY_ID = new Map<string, Role>(ROLES.map((role) => [role.id, role]));

export function getRole(id: string): Role | undefined {
  return ROLES_BY_ID.get(id);
}

/** A villager's role when none is set - every villager starts here (spec: "Typical holder: Everyone"). */
export const DEFAULT_ROLE: RoleId = 'villager';
