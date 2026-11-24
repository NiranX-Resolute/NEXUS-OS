export interface SkillPackage {
  schema_version: string;
  slug: string;
  name: string;
  type: 'skill' | 'agent';
  orbiter_group: string;
  category: string;
  permission_scope: string[];
  instructions_md: string;
  references: string[];
  sha256?: string;
}

export interface CatalogSkillItem {
  slug: string;
  name: string;
  title?: string;
  type: 'skill' | 'agent';
  orbiter_group: string;
  anchor?: string;
  category: string;
  permission_scope: string[];
  package_url: string;
  sha256: string;
  risk_score: number;
  verified: boolean;
  size_bytes?: number;
  description: string;
}

export interface CatalogAgentItem {
  id: string;
  slug: string;
  name: string;
  anchor: string;
  orbiter_group: string;
  role: string;
  category: string;
  description: string;
  skills: string[];
  package_url: string;
  sha256: string;
}

export interface StarterPack {
  slug: string;
  name: string;
  description: string;
  orbiter_group: string;
  skills: string[];
  badge?: string;
}

export interface CatalogData {
  version: string;
  generated_at: string;
  total_skills: number;
  total_agents: number;
  categories: string[];
  orbiters: string[];
  starter_packs: StarterPack[];
  skills: CatalogSkillItem[];
  agents: CatalogAgentItem[];
}

export interface AuditResult {
  safe: boolean;
  score: number;
  risk_score: number;
  status: string;
  findings: Array<{
    severity: string;
    category?: string;
    message: string;
    line?: number;
    snippet?: string;
  }>;
  required_permissions: string[];
}
