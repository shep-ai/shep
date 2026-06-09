/* eslint-disable @next/next/no-img-element -- Story thumbnails use raw <img> to match production */
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import type { MergeReviewEvidence } from '@/components/common/merge-review/merge-review-config';
import { EvidenceLightbox } from './evidence-lightbox';

// ---------------------------------------------------------------------------
// Mock data — placeholder images via data-URI (1×1 colored pixels)
// ---------------------------------------------------------------------------

function mockEvidence(
  index: number,
  overrides?: Partial<MergeReviewEvidence>
): MergeReviewEvidence {
  return {
    type: 'Screenshot',
    capturedAt: `2026-03-09T12:0${index}:00Z`,
    description: `Screenshot ${index + 1} — evidence capture`,
    relativePath: `/home/user/.shep/repos/abc/evidence/screenshot-${index}.png`,
    taskRef: `task-${index + 1}`,
    ...overrides,
  };
}

const threeImages: MergeReviewEvidence[] = [
  mockEvidence(0, { description: 'Homepage after auth banner added' }),
  mockEvidence(1, { description: 'Login form validation error states' }),
  mockEvidence(2, { description: 'Dashboard with new sidebar navigation' }),
];

const singleImage: MergeReviewEvidence[] = [
  mockEvidence(0, { description: 'Final state of the landing page redesign' }),
];

const manyImages: MergeReviewEvidence[] = Array.from({ length: 8 }, (_, i) =>
  mockEvidence(i, {
    description: `Evidence capture ${i + 1} — ${['homepage', 'login form', 'dashboard', 'settings page', 'profile view', 'search results', 'notification panel', 'admin console'][i]}`,
  })
);

const mixedEvidence: MergeReviewEvidence[] = [
  mockEvidence(0, { description: 'Homepage showing new auth banner' }),
  mockEvidence(1, { description: 'Login form with validation errors' }),
  mockEvidence(2, { description: 'Dashboard after navigation update' }),
  {
    type: 'TestOutput',
    capturedAt: '2026-03-09T12:04:00Z',
    description: 'Unit tests — all 42 passing',
    relativePath: '/home/user/.shep/repos/abc/evidence/unit-test-results.txt',
    taskRef: 'task-4',
  },
  {
    type: 'Video',
    capturedAt: '2026-03-09T12:05:00Z',
    description: 'Login flow walkthrough recording',
    relativePath: '/home/user/.shep/repos/abc/evidence/login-flow.mp4',
  },
  {
    type: 'TerminalRecording',
    capturedAt: '2026-03-09T12:06:00Z',
    description: 'CLI auth command output',
    relativePath: '/home/user/.shep/repos/abc/evidence/cli-auth.txt',
    taskRef: 'task-5',
  },
];

// ---------------------------------------------------------------------------
// Helper: thumbnail gallery grid + lightbox (mirrors EvidenceList behavior)
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

function isImageEvidence(e: MergeReviewEvidence): boolean {
  return e.type === 'Screenshot' || IMAGE_EXTENSIONS.has(getExtension(e.relativePath));
}

function buildEvidenceUrl(absolutePath: string): string {
  return `/api/evidence?path=${encodeURIComponent(absolutePath)}`;
}

/** Story wrapper that renders a thumbnail grid + lightbox, matching EvidenceList layout. */
function GalleryWithLightbox({
  evidence,
  initialOpen = false,
  initialIndex = 0,
}: {
  evidence: MergeReviewEvidence[];
  initialOpen?: boolean;
  initialIndex?: number;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const imageEvidence = evidence.filter(isImageEvidence);
  const nonImageEvidence = evidence.filter((e) => !isImageEvidence(e));

  return (
    <div className="border-border rounded-lg border">
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-foreground text-xs font-semibold">Evidence</span>
          <span className="bg-secondary text-secondary-foreground rounded-md px-1.5 py-0.5 text-[10px] font-medium">
            {evidence.length}
          </span>
        </div>

        {imageEvidence.length > 0 ? (
          <div className="mb-3 grid grid-cols-3 gap-2">
            {imageEvidence.map((e, i) => (
              <button
                key={e.relativePath}
                type="button"
                className="cursor-pointer overflow-hidden rounded-md border"
                onClick={() => {
                  setSelectedIndex(i);
                  setOpen(true);
                }}
              >
                <img
                  src={buildEvidenceUrl(e.relativePath)}
                  alt={e.description}
                  className="aspect-square w-full bg-gray-100 object-cover dark:bg-gray-800"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        ) : null}

        {nonImageEvidence.length > 0 ? (
          <ul className="space-y-2">
            {nonImageEvidence.map((e) => (
              <li key={e.relativePath} className="border-border rounded-md border">
                <div className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="text-foreground text-xs font-medium">{e.description}</span>
                  <span className="text-muted-foreground text-[10px]">({e.type})</span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <EvidenceLightbox
        images={imageEvidence}
        open={open}
        onOpenChange={setOpen}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={setSelectedIndex}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof EvidenceLightbox> = {
  title: 'Common/EvidenceLightbox',
  component: EvidenceLightbox,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '400px', border: '1px solid var(--color-border)', padding: '16px' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EvidenceLightbox>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Default — 3-column thumbnail gallery with 3 image evidence items. Click to open lightbox. */
export const Default: Story = {
  render: () => <GalleryWithLightbox evidence={threeImages} />,
};

/** Lightbox open — dialog visible with image, counter, nav buttons, description, and download. */
export const LightboxOpen: Story = {
  render: () => <GalleryWithLightbox evidence={threeImages} initialOpen initialIndex={1} />,
};

/** Single image — gallery with one thumbnail. Lightbox opens without nav buttons or counter. */
export const SingleImage: Story = {
  render: () => <GalleryWithLightbox evidence={singleImage} initialOpen />,
};

/** Many images — 8 images in the gallery grid to test multi-row layout. */
export const ManyImages: Story = {
  render: () => <GalleryWithLightbox evidence={manyImages} />,
};

/** Mixed evidence — images in gallery grid + non-images listed below as expandable items. */
export const MixedEvidence: Story = {
  render: () => <GalleryWithLightbox evidence={mixedEvidence} />,
};

/** Lightbox only (controlled) — raw EvidenceLightbox component with args. */
export const LightboxControlled: Story = {
  args: {
    images: threeImages,
    open: true,
    onOpenChange: fn().mockName('onOpenChange'),
    selectedIndex: 0,
    onSelectedIndexChange: fn().mockName('onSelectedIndexChange'),
  },
};
