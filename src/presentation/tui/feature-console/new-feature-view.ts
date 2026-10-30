/**
 * New feature form (spec 150, task-28).
 *
 * `N` creates a feature in the selected feature's repository. The description
 * is typed on the status line; enter creates. While the selfLearning flag is
 * on, the form also offers Explore for this one feature: tab turns it on and
 * up / down choose its rollout budget k. With the flag off there is no Explore
 * choice and nothing about it reaches the create input.
 */

import type { TFunction } from 'i18next';
import { Input, matchesKey, wrapTextWithAnsi } from '@mariozechner/pi-tui';
import { MAX_EXPLORE_K } from '@/domain/harness-learning/learning-config.js';
import { fit, paint } from './console-format.js';
import { NS } from './console-labels.js';
import { padTo } from './console-layout.js';
import type { ConsoleOverlay, OverlayPrompt } from './console-overlay.js';
import type { ConsoleExplore, ConsoleNewFeature } from './console-create.js';

export interface NewFeatureIntents {
  create(input: ConsoleNewFeature): void;
  close(): void;
  quit(): void;
}

export interface NewFeatureRepository {
  name: string;
  path: string;
}

const MIN_EXPLORE_K = 1;
const LABEL_WIDTH = 10;

export class NewFeatureView implements ConsoleOverlay {
  private readonly description = new Input();
  private repository: NewFeatureRepository = { name: '', path: '' };
  private explore = false;
  private k = MIN_EXPLORE_K;

  constructor(
    private readonly t: TFunction,
    private readonly intents: NewFeatureIntents,
    /** Undefined while the selfLearning flag is off: no Explore choice. */
    private readonly exploreOffer: ConsoleExplore | undefined
  ) {}

  open(repository: NewFeatureRepository): void {
    this.repository = repository;
    this.explore = false;
    this.k = clampK(this.exploreOffer?.defaultK ?? MIN_EXPLORE_K);
    this.description.setValue('');
    this.description.focused = true;
  }

  get prompt(): OverlayPrompt {
    return { label: this.t(`${NS}.create.prompt`), input: this.description };
  }

  get hint(): string {
    return this.t(`${NS}.create.${this.exploreOffer ? 'hintExplore' : 'hint'}`);
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'ctrl+c')) return this.intents.quit();
    if (matchesKey(data, 'escape')) return this.close();
    if (matchesKey(data, 'enter')) return this.submit();
    if (this.exploreOffer && matchesKey(data, 'tab')) {
      this.explore = !this.explore;
      return;
    }
    if (this.explore && matchesKey(data, 'up')) return this.changeK(1);
    if (this.explore && matchesKey(data, 'down')) return this.changeK(-1);
    if (matchesKey(data, 'tab')) return;
    this.description.handleInput(data);
  }

  render(width: number, height: number): string[] {
    const { t } = this;
    const lines = [
      paint.title(t(`${NS}.create.title`, { repository: this.repository.name })),
      '',
      ...wrap(paint.muted(t(`${NS}.create.describe`)), width),
      ...(this.exploreOffer ? ['', ...this.renderExplore(width)] : []),
    ];
    return padTo(lines, height).map((line) => fit(line, width));
  }

  private renderExplore(width: number): string[] {
    const { t } = this;
    const label = (key: string) => paint.label(t(`${NS}.create.${key}`).padEnd(LABEL_WIDTH));
    const state = this.explore
      ? paint.attention(t(`${NS}.create.on`))
      : paint.muted(t(`${NS}.create.off`));
    return [
      `${label('explore')}${state}`,
      ...(this.explore
        ? [
            `${label('k')}${this.k}  ${paint.muted(t(`${NS}.create.kRange`, { max: MAX_EXPLORE_K }))}`,
          ]
        : []),
      ...wrap(paint.muted(t(`${NS}.create.exploreCost`)), width),
    ];
  }

  private submit(): void {
    const userInput = this.description.getValue().trim();
    if (!userInput) return;
    this.description.focused = false;
    this.intents.create({
      repositoryPath: this.repository.path,
      userInput,
      ...(this.explore ? { exploreHarness: true, exploreK: this.k } : {}),
    });
  }

  private close(): void {
    this.description.focused = false;
    this.intents.close();
  }

  private changeK(delta: number): void {
    this.k = clampK(this.k + delta);
  }
}

function clampK(k: number): number {
  return Math.min(Math.max(Math.round(k), MIN_EXPLORE_K), MAX_EXPLORE_K);
}

function wrap(text: string, width: number): string[] {
  return wrapTextWithAnsi(text, Math.max(1, width));
}
