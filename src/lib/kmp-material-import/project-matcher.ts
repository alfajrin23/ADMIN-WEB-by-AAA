import type { Project } from "@/lib/types";
import type {
  KmpMaterialImportProjectAlias,
  KmpMaterialImportProjectCandidate,
} from "@/lib/kmp-material-import/types";
import {
  isKmpCianjurClient,
  normalizeImportText,
  normalizeProjectIdentity,
} from "@/lib/kmp-material-import/validators";

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]! +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        substitution,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
}

export function getTextSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeProjectIdentity(left);
  const normalizedRight = normalizeProjectIdentity(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  const maximumLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / maximumLength;
}

function toCandidate(
  project: Project,
  confidence: number,
  reason: string,
): KmpMaterialImportProjectCandidate {
  return {
    id: project.id,
    name: project.name,
    code: project.code,
    clientName: project.clientName,
    confidence,
    reason,
  };
}

function hasExactDistrict(project: Project, district: string) {
  const normalizedDistrict = normalizeProjectIdentity(district);
  if (!normalizedDistrict) {
    return false;
  }
  const locationText = normalizeImportText(`${project.code ?? ""} ${project.name}`);
  return ` ${locationText} `.includes(` ${normalizedDistrict} `);
}

export type KmpProjectMatchResult = {
  projectId: string | null;
  projectName: string | null;
  status:
    | "exact"
    | "alias"
    | "suggested"
    | "ambiguous_project"
    | "unmatched_project";
  candidates: KmpMaterialImportProjectCandidate[];
};

export function matchKmpProject(input: {
  excelProjectName: string;
  district: string;
  projects: Project[];
  aliases?: KmpMaterialImportProjectAlias[];
}): KmpProjectMatchResult {
  const projects = input.projects.filter((project) => isKmpCianjurClient(project.clientName));
  const normalizedName = normalizeProjectIdentity(input.excelProjectName);
  const normalizedDistrict = normalizeProjectIdentity(input.district);
  const exactNameProjects = projects.filter(
    (project) => normalizeProjectIdentity(project.name) === normalizedName,
  );
  const exactNameAndDistrict = exactNameProjects.filter((project) =>
    hasExactDistrict(project, normalizedDistrict),
  );

  if (exactNameAndDistrict.length === 1) {
    const project = exactNameAndDistrict[0]!;
    return {
      projectId: project.id,
      projectName: project.name,
      status: "exact",
      candidates: [toCandidate(project, 1, "Nama proyek dan kecamatan sama.")],
    };
  }
  if (exactNameAndDistrict.length > 1) {
    return {
      projectId: null,
      projectName: null,
      status: "ambiguous_project",
      candidates: exactNameAndDistrict.map((project) =>
        toCandidate(project, 1, "Lebih dari satu proyek mempunyai nama dan lokasi yang sama."),
      ),
    };
  }

  const rememberedAlias = input.aliases?.find(
    (alias) =>
      normalizeProjectIdentity(alias.excelProjectName) === normalizedName &&
      normalizeProjectIdentity(alias.excelDistrict) === normalizedDistrict,
  );
  if (rememberedAlias) {
    const project = projects.find((item) => item.id === rememberedAlias.projectId);
    if (project) {
      return {
        projectId: project.id,
        projectName: project.name,
        status: "alias",
        candidates: [toCandidate(project, 0.99, "Pemetaan tersimpan.")],
      };
    }
  }

  if (exactNameProjects.length === 1) {
    const project = exactNameProjects[0]!;
    return {
      projectId: project.id,
      projectName: project.name,
      status: "exact",
      candidates: [
        toCandidate(project, 0.95, "Nama proyek sama dan hanya mempunyai satu kandidat."),
      ],
    };
  }
  if (exactNameProjects.length > 1) {
    return {
      projectId: null,
      projectName: null,
      status: "ambiguous_project",
      candidates: exactNameProjects.map((project) =>
        toCandidate(project, 0.95, "Nama sama; kecamatan perlu dipilih manual."),
      ),
    };
  }

  const fuzzyCandidates = projects
    .map((project) => {
      const nameScore = getTextSimilarity(input.excelProjectName, project.name);
      const districtBonus = hasExactDistrict(project, input.district) ? 0.12 : 0;
      return {
        project,
        confidence: Math.min(1, nameScore + districtBonus),
      };
    })
    .filter((candidate) => candidate.confidence >= 0.68)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

  if (fuzzyCandidates.length > 0) {
    return {
      projectId: null,
      projectName: null,
      status: "suggested",
      candidates: fuzzyCandidates.map(({ project, confidence }) =>
        toCandidate(project, confidence, "Kemiripan nama; wajib dikonfirmasi manual."),
      ),
    };
  }

  return {
    projectId: null,
    projectName: null,
    status: "unmatched_project",
    candidates: [],
  };
}
