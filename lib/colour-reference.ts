export type ColourReference = {
  id: string;
  revision: number;
  status: 'pending' | 'approved' | 'rejected';
  mediaId: string;
  sourceMediaIds: string[];
  provenance: 'native-prepared' | 'api';
  provenanceNote: string;
  createdAt: string;
  reviewedAt: string | null;
  approvalVersion: number | null;
  url: string;
  sources: { id: string; url: string }[];
};

export const COLOUR_REFERENCE_REVIEW_VERSION = 1;
