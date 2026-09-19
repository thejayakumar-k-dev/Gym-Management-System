/**
 * Neon REST API client — manages projects programmatically.
 *
 * Uses the org-wide NEON_API_KEY to:
 * - Create new Neon projects for each gym
 * - Get connection strings
 * - List all projects
 * - Delete projects
 *
 * API docs: https://neon.tech/docs/manage/api
 */

const NEON_API_KEY = process.env.NEON_API_KEY;
const NEON_API_BASE = "https://console.neon.tech/api/v2";

if (!NEON_API_KEY) {
  console.warn("[neon-api] NEON_API_KEY not set — project management disabled");
}

// ── Types ─────────────────────────────────────────────────────────────

export interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  created_at: string;
  updated_at: string;
  default_branch_id: string;
  database_host: string;
  database_name: string;
  connection_uris: {
    connection_uri: string;
    pooler_connection_uri: string;
    host: string;
    host_pooler: string;
    port: number;
    database: string;
    password: string;
    role_name: string;
    api_password: string;
  }[];
}

export interface CreateProjectResponse {
  project: NeonProject;
  connection_uris: NeonProject["connection_uris"];
}

// ── API helpers ───────────────────────────────────────────────────────

async function neonFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!NEON_API_KEY) {
    throw new Error("NEON_API_KEY not configured");
  }

  const url = `${NEON_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${NEON_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Neon API error ${response.status}: ${errorBody}`
    );
  }

  return response.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Create a new Neon project for a gym.
 *
 * @param name - Project name (e.g., "Gym-1", "Gym-FitLife")
 * @param region - Neon region (default: same as org)
 * @returns Project details including connection strings
 */
export async function createNeonProject(
  name: string,
  region?: string
): Promise<CreateProjectResponse> {
  const body: Record<string, unknown> = {
    project: { name },
  };

  // Pin to the same region as the admin project if not specified
  if (region) {
    (body.project as any).region_id = region;
  }

  const result = await neonFetch<CreateProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });

  console.log(`[neon-api] Created project "${name}" (${result.project.id})`);
  return result;
}

/**
 * Get a Neon project by ID.
 */
export async function getNeonProject(
  projectId: string
): Promise<NeonProject> {
  const result = await neonFetch<{ project: NeonProject }>(
    `/projects/${projectId}`
  );
  return result.project;
}

/**
 * List all Neon projects in the organization.
 */
export async function listNeonProjects(): Promise<NeonProject[]> {
  const result = await neonFetch<{ projects: NeonProject[] }>("/projects");
  return result.projects;
}

/**
 * Delete a Neon project.
 */
export async function deleteNeonProject(projectId: string): Promise<void> {
  await neonFetch(`/projects/${projectId}`, { method: "DELETE" });
  console.log(`[neon-api] Deleted project ${projectId}`);
}

/**
 * Get the default branch's connection URI for a project.
 */
export async function getProjectConnectionString(
  projectId: string
): Promise<string> {
  const project = await getNeonProject(projectId);
  const connUri = project.connection_uris?.[0]?.pooler_connection_uri;
  if (!connUri) {
    throw new Error(`No connection URI found for project ${projectId}`);
  }
  return connUri;
}
