export const PROJECT_FORMAT_VERSION = '1.0.0' as const;

export type ProjectPreset = 'empty' | 'empty-2d' | 'empty-3d';

export type ProjectTemplateLineage = {
  id: string;
  version: string;
};

export type ProjectManifest = {
  schemaVersion: typeof PROJECT_FORMAT_VERSION;
  id: string;
  name: string;
  engine: {
    version: string;
    projectFormat: typeof PROJECT_FORMAT_VERSION;
  };
  entry: { scene: string };
  templates: ProjectTemplateLineage[];
  targets: string[];
  defaultTarget: string;
  capabilities: string[];
  paths: {
    assets: string;
    scenes: string;
    tests: string;
    replays: string;
  };
};

export type ProjectSummary = {
  root: string;
  manifest: ProjectManifest;
  gitInitialized: boolean;
  gitMessage?: string;
};

export type CreateProjectRequest = {
  parentDirectory: string;
  name: string;
  directoryName?: string;
  preset?: ProjectPreset;
  initializeGit?: boolean;
};

export type DoctorSeverity = 'info' | 'warning' | 'error';

export type DoctorDiagnostic = {
  code: string;
  severity: DoctorSeverity;
  message: string;
  path?: string;
  remediation?: string;
};

export type DoctorCheck = {
  id: string;
  label: string;
  status: 'passed' | 'warning' | 'failed';
};

export type DoctorReport = {
  ok: boolean;
  projectRoot: string;
  manifest?: ProjectManifest;
  checks: DoctorCheck[];
  diagnostics: DoctorDiagnostic[];
};

export class ProjectError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
    this.details = details;
  }
}
