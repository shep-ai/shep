import { PHASES } from './constants.js';

export class Renderer {
  constructor(state, layout) {
    this.state = state;
    this.layout = layout;
  }

  render(onNodeClick, onAddChild, onDeepDive, onTaskClick) {
    const container = document.getElementById('node-layer');
    const svgLayer = document.getElementById('connector-layer');
    container.innerHTML = '';
    svgLayer.innerHTML = '';

    // Check view mode - seamless canvas switching
    if (this.state.viewMode === 'phases') {
      this.renderPhasesView(container, svgLayer);
      this.updateCanvasHeader(true, 'Implementation Phases');
    } else if (this.state.viewMode === 'tasks') {
      this.renderTasksView(container, svgLayer, onTaskClick);
      this.updateCanvasHeader(true);
    } else {
      this.renderFeaturesView(container, svgLayer, onNodeClick, onAddChild, onDeepDive);
      this.updateCanvasHeader(false);
    }
  }

  updateCanvasHeader(isDetailView, subtitle = null) {
    const backBtn = document.getElementById('back-btn');
    const canvasTitle = document.getElementById('canvas-title');
    const headerContainer = canvasTitle.parentElement;
    const topRightControls = document.querySelector('.fixed.top-4.right-4.z-40');

    // On empty canvas (welcome view): keep hero title visible, hide controls
    const isEmpty = this.state.viewMode === 'features' && this.state.getCanvasRepos().length === 0;
    if (isEmpty) {
      headerContainer.style.display = '';
      // Hide controls on welcome view
      if (topRightControls) topRightControls.style.display = 'none';
      // Reset to default hero title
      backBtn.classList.add('hidden');
      canvasTitle.textContent = '';
      const titleText = document.createTextNode('Features');
      const br = document.createElement('br');
      const subtitleSpan = document.createElement('span');
      subtitleSpan.className = 'text-slate-300';
      subtitleSpan.textContent = 'Control Center';
      canvasTitle.appendChild(titleText);
      canvasTitle.appendChild(br);
      canvasTitle.appendChild(subtitleSpan);
      return;
    }

    headerContainer.style.display = '';
    if (topRightControls) topRightControls.style.display = '';

    if (isDetailView) {
      const feature = this.state.getFeature(this.state.focusedFeatureId);
      backBtn.classList.remove('hidden');
      // Clear and rebuild title safely
      canvasTitle.textContent = '';
      const titleText = document.createTextNode(feature?.title || 'Details');
      const br = document.createElement('br');
      const subtitleSpan = document.createElement('span');
      subtitleSpan.className = 'text-slate-300';
      subtitleSpan.textContent = subtitle || 'Task Breakdown';
      canvasTitle.appendChild(titleText);
      canvasTitle.appendChild(br);
      canvasTitle.appendChild(subtitleSpan);
    } else {
      backBtn.classList.add('hidden');
      canvasTitle.textContent = '';
      const titleText = document.createTextNode('Features');
      const br = document.createElement('br');
      const subtitleSpan = document.createElement('span');
      subtitleSpan.className = 'text-slate-300';
      subtitleSpan.textContent = 'Control Center';
      canvasTitle.appendChild(titleText);
      canvasTitle.appendChild(br);
      canvasTitle.appendChild(subtitleSpan);
    }
  }

  renderFeaturesView(container, svgLayer, onNodeClick, onAddChild, onDeepDive) {
    // Canvas is a pure view layer - show repos that are onCanvas in the DB
    const canvasRepos = this.state.getCanvasRepos();
    const hasCanvasRepos = canvasRepos.length > 0;

    // Show welcome view when no repos are on canvas
    if (!hasCanvasRepos) {
      this.renderWelcomeView(container, svgLayer, onAddChild);
      return;
    }

    // Render canvas with onCanvas repos (they may or may not have features)
    const featuresByRepo = this.state.getFeaturesByRepo();
    const { repoPositions, featurePositions, totalHeight } = this.layout.calculateWithRepos(
      featuresByRepo,
      canvasRepos
    );
    if (repoPositions) {

      // Always start below the fixed header
      const offsetY = 140;

      repoPositions.forEach((pos) => {
        pos.y += offsetY;
      });
      featurePositions.forEach((pos) => {
        pos.y += offsetY;
      });

      const totalContentHeight = totalHeight + offsetY + 160;
      container.style.height = `${totalContentHeight}px`;
      svgLayer.style.height = `${totalContentHeight}px`;

      // Render repo-to-feature connectors
      this.renderRepoConnectors(canvasRepos, repoPositions, featuresByRepo, featurePositions, svgLayer);

      // Render feature-to-feature connectors (parent-child)
      this.renderConnectors(featurePositions, svgLayer);

      // Render repo pills
      this.renderRepoPills(canvasRepos, repoPositions, container, onAddChild);

      // Render feature nodes
      this.renderNodes(featurePositions, onNodeClick, onAddChild, onDeepDive);

      // Render "Add Repository" button aligned with where next repo pill would appear
      this.renderAddRepoButton(container, totalHeight + offsetY + this.layout.NODE_HEIGHT / 2 - 20);

      return;
    }

    // Fallback: features without repos (shouldn't happen with new model)
    const roots = this.state.getHierarchy();
    const fallbackResult = this.layout.calculate(roots);
    const fallbackOffsetY = 140;
    fallbackResult.positions.forEach((pos) => {
      pos.y += fallbackOffsetY;
    });
    const fallbackContentHeight = fallbackResult.totalHeight + fallbackOffsetY + 120;
    container.style.height = `${fallbackContentHeight}px`;
    svgLayer.style.height = `${fallbackContentHeight}px`;
    this.renderConnectors(fallbackResult.positions, svgLayer);
    this.renderNodes(fallbackResult.positions, onNodeClick, onAddChild, onDeepDive);
    this.renderNewFeatureButton(container, fallbackResult.totalHeight, fallbackOffsetY, onAddChild);
  }

  renderWelcomeView(container, svgLayer, _onAddChild) {
    // Reset container and canvas sizes
    container.style.height = 'auto';
    const svgLayerElement = svgLayer || document.getElementById('connector-layer');
    if (svgLayerElement) {
      svgLayerElement.style.height = 'auto';
    }

    const wrapper = document.createElement('div');
    wrapper.className =
      'welcome-view flex flex-col items-center justify-center min-h-screen gap-12 px-8';

    // Repositories section - centered at top
    const repoSection = document.createElement('div');
    repoSection.className = 'flex flex-col items-center gap-4';

    const repoHeader = document.createElement('div');
    repoHeader.className = 'welcome-repo-header';
    const repoHeaderIcon = document.createElement('i');
    repoHeaderIcon.className = 'fab fa-github';
    const repoHeaderText = document.createElement('span');
    repoHeaderText.textContent = 'Repositories';
    repoHeader.appendChild(repoHeaderIcon);
    repoHeader.appendChild(repoHeaderText);
    repoSection.appendChild(repoHeader);

    // Repo list
    const repoList = document.createElement('div');
    repoList.className = 'welcome-repo-list';
    repoList.id = 'welcome-repo-list';

    // Get repos NOT yet on canvas — add 2 default repos if none exist at all
    let allRepos = this.state.getRepositories();

    if (allRepos.length === 0) {
      // Initialize with 2 default repos on welcome screen
      const defaultRepos = [
        { fullName: 'shep-ai/shep', localPath: '/Users/developer/workspaces/shep-ai-cli' },
        {
          fullName: 'acme-corp/platform-api',
          localPath: '/Users/developer/workspaces/platform-api',
        },
      ];

      defaultRepos.forEach((repoData) => {
        const repo = this.state.addRepository(repoData.fullName);
        if (repo) {
          repo.localPath = repoData.localPath;
        }
      });
    }

    // Only show repos NOT on canvas in the welcome view
    const welcomeRepos = this.state.getWelcomeRepos();

    welcomeRepos.forEach((repo) => {
      const pill = this.createRepoPillButton(repo);
      repoList.appendChild(pill);
    });

    repoSection.appendChild(repoList);

    // Add Repository button
    const addRepoBtn = document.createElement('button');
    addRepoBtn.className = 'welcome-add-repo-btn';
    addRepoBtn.onclick = () => window.app.addNewRepository();
    const addRepoIcon = document.createElement('i');
    addRepoIcon.className = 'fas fa-plus';
    const addRepoText = document.createElement('span');
    addRepoText.textContent = 'Add Repository';
    addRepoBtn.appendChild(addRepoIcon);
    addRepoBtn.appendChild(addRepoText);
    repoSection.appendChild(addRepoBtn);

    wrapper.appendChild(repoSection);

    // CLI section (centered below)
    const cliSection = document.createElement('div');
    cliSection.className = 'welcome-cli flex flex-col items-center gap-4';

    const cliHeader = document.createElement('div');
    cliHeader.className = 'welcome-cli-header';
    const cliHeaderIcon = document.createElement('i');
    cliHeaderIcon.className = 'fas fa-terminal';
    const cliHeaderText = document.createElement('span');
    cliHeaderText.textContent = 'Or start from the command line';
    cliHeader.appendChild(cliHeaderIcon);
    cliHeader.appendChild(cliHeaderText);
    cliSection.appendChild(cliHeader);

    const cliBlock = document.createElement('div');
    cliBlock.className = 'welcome-cli-block';

    const line1 = document.createElement('div');
    line1.className = 'welcome-cli-line';
    const prompt1 = document.createElement('span');
    prompt1.className = 'cli-prompt';
    prompt1.textContent = '$';
    const cmd1 = document.createElement('span');
    cmd1.className = 'cli-cmd';
    cmd1.textContent = 'cd';
    const path1 = document.createElement('span');
    path1.className = 'cli-path';
    path1.textContent = '~/my-repo';
    line1.appendChild(prompt1);
    line1.appendChild(cmd1);
    line1.appendChild(path1);

    const line2 = document.createElement('div');
    line2.className = 'welcome-cli-line';
    const prompt2 = document.createElement('span');
    prompt2.className = 'cli-prompt';
    prompt2.textContent = '$';
    const cmd2 = document.createElement('span');
    cmd2.className = 'cli-cmd';
    cmd2.textContent = 'shep';
    const arg2 = document.createElement('span');
    arg2.className = 'cli-arg';
    arg2.textContent = 'feat new';
    const str2 = document.createElement('span');
    str2.className = 'cli-string';
    str2.textContent = '"create modern, sleek dashboards"';
    line2.appendChild(prompt2);
    line2.appendChild(cmd2);
    line2.appendChild(arg2);
    line2.appendChild(str2);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'welcome-cli-copy';
    copyBtn.title = 'Copy to clipboard';
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.copyCliCommand();
    };
    const copyIcon = document.createElement('i');
    copyIcon.className = 'fas fa-copy';
    copyBtn.appendChild(copyIcon);

    cliBlock.appendChild(line1);
    cliBlock.appendChild(line2);
    cliBlock.appendChild(copyBtn);
    cliSection.appendChild(cliBlock);

    const cliHint = document.createElement('p');
    cliHint.className = 'welcome-cli-hint';
    cliHint.textContent = 'Feature will appear on canvas once created';
    cliSection.appendChild(cliHint);

    wrapper.appendChild(cliSection);
    container.appendChild(wrapper);
  }

  /**
   * Create a clickable repo pill for the welcome screen
   */
  createRepoPillButton(repo) {
    const pill = document.createElement('button');
    pill.className = 'repo-pill-btn';
    pill.dataset.repoId = repo.id;

    pill.onclick = (e) => {
      e.stopPropagation();
      window.app.selectWelcomeRepo(repo.id);
    };

    const icon = document.createElement('i');
    icon.className = 'fab fa-github repo-pill-icon';

    const name = document.createElement('span');
    name.className = 'repo-pill-name';
    name.textContent = repo.fullName;

    const path = document.createElement('span');
    path.className = 'repo-pill-path';
    path.textContent = repo.localPath || '/path/to/repo';
    path.title = `Open in VSCode: ${repo.localPath}`;
    path.style.cursor = 'pointer';
    path.onclick = (e) => {
      e.stopPropagation();
      // Open in VSCode
      window.app.openInVSCode(repo.localPath);
    };

    pill.appendChild(icon);
    pill.appendChild(name);
    pill.appendChild(path);

    return pill;
  }

  /**
   * Mind-map ideas disabled - keeping simple welcome view without suggestions
   */
  renderMindMapIdeas(_repoId) {
    // Ideas preview removed - user can add features directly
  }

  /**
   * Render selected repo pill on welcome canvas
   */
  renderRepoOnWelcomeCanvas(repoId) {
    const canvas = document.getElementById('welcome-idea-canvas');
    if (!canvas) return;

    // Clear existing content
    while (canvas.firstChild) canvas.removeChild(canvas.firstChild);

    const repo = this.state.getRepository(repoId);
    if (!repo) return;

    // Container for the repo pill
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.height = '100%';
    container.style.width = '100%';

    // Repo pill
    const pill = document.createElement('div');
    pill.className = 'canvas-repo-pill';
    pill.style.position = 'static';

    const icon = document.createElement('i');
    icon.className = 'fab fa-github canvas-repo-icon';

    const name = document.createElement('span');
    name.className = 'canvas-repo-name';
    name.textContent = repo.fullName;

    const addBtn = document.createElement('button');
    addBtn.className = 'canvas-repo-add-btn';
    addBtn.title = 'Add feature to this repo';
    addBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.createFeatureForRepo(repoId);
    };
    const addIcon = document.createElement('i');
    addIcon.className = 'fas fa-plus';
    addBtn.appendChild(addIcon);

    pill.appendChild(icon);
    pill.appendChild(name);
    pill.appendChild(addBtn);
    container.appendChild(pill);
    canvas.appendChild(container);
  }

  /**
   * Render repo pills on the features canvas (positioned absolutely)
   */
  renderRepoPills(repos, repoPositions, container, _onAddChild) {
    repos.forEach((repo) => {
      const pos = repoPositions.get(repo.id);
      if (!pos) return;

      const pill = document.createElement('div');
      pill.className = 'canvas-repo-pill';
      pill.style.position = 'absolute';
      pill.style.left = `${pos.x}px`;
      pill.style.top = `${pos.y}px`;

      const icon = document.createElement('i');
      icon.className = 'fab fa-github canvas-repo-icon';

      const name = document.createElement('span');
      name.className = 'canvas-repo-name';
      name.textContent = repo.fullName;

      const path = document.createElement('span');
      path.className = 'canvas-repo-path';
      path.textContent = repo.localPath || '/path/to/repo';
      path.title = `Open in VSCode: ${repo.localPath}`;
      path.style.cursor = 'pointer';
      path.onclick = (e) => {
        e.stopPropagation();
        window.app.openInVSCode(repo.localPath);
      };

      const addBtn = document.createElement('button');
      addBtn.className = 'canvas-repo-add-btn';
      addBtn.title = 'Add feature to this repo';
      addBtn.onclick = (e) => {
        e.stopPropagation();
        window.app.createFeatureForRepo(repo.id);
      };
      const addIcon = document.createElement('i');
      addIcon.className = 'fas fa-plus';
      addBtn.appendChild(addIcon);

      pill.appendChild(icon);
      pill.appendChild(name);
      pill.appendChild(path);
      pill.appendChild(addBtn);
      container.appendChild(pill);
    });
  }

  /**
   * Render SVG connectors from repo pills to their features
   */
  renderRepoConnectors(repos, repoPositions, featuresByRepo, featurePositions, svgLayer) {
    repos.forEach((repo) => {
      const repoPos = repoPositions.get(repo.id);
      if (!repoPos) return;

      const features = featuresByRepo.get(repo.id) || [];

      // Only connect to root/peer level features (no parent)
      // This prevents connecting repos to transitive/child features
      const rootFeatures = features.filter((f) => !f.parentId);

      rootFeatures.forEach((feature) => {
        const featPos = featurePositions.get(feature.id);
        if (!featPos) return;

        // From right edge of repo pill to left edge of feature card
        const startX = repoPos.x + this.layout.REPO_PILL_WIDTH;
        const startY = repoPos.y + 20; // vertical center of pill (40px height / 2)
        const endX = featPos.x;
        const endY = featPos.y + 48; // vertical center of feature card (96px / 2)

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cpx = startX + (endX - startX) / 2;
        path.setAttribute(
          'd',
          `M ${startX} ${startY} C ${cpx} ${startY}, ${cpx} ${endY}, ${endX} ${endY}`
        );
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#cbd5e1');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-dasharray', '4 3');
        svgLayer.appendChild(path);
      });
    });
  }

  /**
   * Render "Add Repository" button on the features canvas
   */
  renderAddRepoButton(container, yPosition) {
    const btn = document.createElement('button');
    btn.className = 'canvas-add-repo-btn';
    btn.style.position = 'absolute';
    btn.style.left = '50px';
    btn.style.top = `${yPosition}px`;
    btn.onclick = (e) => {
      e.stopPropagation();
      window.app.addNewRepository();
    };

    const icon = document.createElement('i');
    icon.className = 'fas fa-plus';
    const text = document.createElement('span');
    text.textContent = 'Add Repository';

    btn.appendChild(icon);
    btn.appendChild(text);
    container.appendChild(btn);
  }

  renderTasksView(container, svgLayer, onTaskClick) {
    const tasks = this.state.getCanvasTasks();

    if (tasks.length === 0) {
      this.renderEmptyTasksView(container);
      return;
    }

    // Sort tasks by order
    const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

    // Calculate layout (left to right flow with dependency lines)
    // Lower position to avoid title overlap
    const startX = 100;
    const startY = 200;
    const spacing = 300;

    // Render tasks
    sortedTasks.forEach((task, index) => {
      const x = startX + index * spacing;
      const y = startY;

      const el = document.createElement('div');
      el.className = 'absolute w-[260px] h-24 group cursor-pointer node-enter';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.onclick = () => onTaskClick(task.id);

      const taskCard = this.createTaskCard(task);
      el.appendChild(taskCard);

      container.appendChild(el);
    });

    // Render dependency lines (if tasks have dependsOn)
    this.renderTaskDependencies(sortedTasks, svgLayer, startX, startY, spacing);
  }

  renderEmptyTasksView(container) {
    const el = document.createElement('div');
    el.className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center';

    const icon = document.createElement('i');
    icon.className = 'fas fa-tasks text-slate-300 text-4xl mb-4';

    const text = document.createElement('p');
    text.className = 'text-slate-400 text-sm';
    text.textContent = 'No tasks yet for this feature';

    el.appendChild(icon);
    el.appendChild(text);
    container.appendChild(el);
  }

  renderTaskDependencies(tasks, svgLayer, startX, startY, spacing) {
    // Simple connecting lines between sequential tasks
    for (let i = 0; i < tasks.length - 1; i++) {
      const startPosX = startX + i * spacing + 260;
      const endPosX = startX + (i + 1) * spacing;
      const posY = startY + 48;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const cpx = startPosX + (endPosX - startPosX) / 2;
      path.setAttribute(
        'd',
        `M ${startPosX} ${posY} C ${cpx} ${posY}, ${cpx} ${posY}, ${endPosX} ${posY}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#e2e8f0');
      path.setAttribute('stroke-width', '1.5');
      svgLayer.appendChild(path);
    }
  }

  renderConnectors(positions, svgLayer) {
    this.state.nodes.forEach((node) => {
      if (node.parentId && positions.has(node.id) && positions.has(node.parentId)) {
        const start = positions.get(node.parentId);
        const end = positions.get(node.id);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cp1x = start.x + 260 + (end.x - start.x - 260) / 2;
        path.setAttribute(
          'd',
          `M ${start.x + 260} ${start.y + 48} C ${cp1x} ${start.y + 48}, ${cp1x} ${end.y + 48}, ${end.x} ${end.y + 48}`
        );
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#e2e8f0');
        path.setAttribute('stroke-width', '1.5');
        svgLayer.appendChild(path);
      }
    });
  }

  renderNodes(positions, onNodeClick, onAddChild, onDeepDive) {
    const container = document.getElementById('node-layer');

    this.state.nodes.forEach((node) => {
      if (!positions.has(node.id)) return;
      const pos = positions.get(node.id);
      const phase = PHASES.find((p) => p.id === node.phaseId) || PHASES[0];
      const isSelected = this.state.selectedNodeId === node.id;

      // Determine feature status (for color scheme)
      const status = this.getFeatureStatus(node);

      // Get granular progress (includes sub-progress within phase)
      const granularProgress = this.state.getGranularProgress(node.id);
      const rawPercent = granularProgress.totalProgress;
      const displayPercent = Math.max(5, rawPercent);

      let animationClass = '';
      const glowClass = '';

      if (status === 'awaiting-action') {
        // Yellow heartbeat glow for action required
        animationClass = 'heartbeat-glow';
      } else if (status === 'running') {
        // Blue construction jigsaw for in-progress features
        animationClass = 'construction-progress';
      }

      // Check if this card already exists in the DOM
      const existingEl = container.querySelector(`[data-feature-id="${node.id}"]`);
      const isNewCard = !existingEl;

      const el = document.createElement('div');
      // Only apply node-enter animation to newly created cards
      el.className = `absolute w-[260px] h-24 group cursor-pointer${isNewCard ? ' node-enter' : ''}`;
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.dataset.featureId = node.id; // Add data attribute for easy lookup
      el.dataset.status = status; // Add status for drawer styling
      el.onclick = () => onNodeClick(node.id);

      // Remove animation class after it completes to prevent flickering on re-renders
      if (isNewCard) {
        el.addEventListener(
          'animationend',
          () => {
            el.classList.remove('node-enter');
          },
          { once: true }
        );
      }

      const nodeHTML = this.createNodeHTML(
        node,
        phase,
        isSelected,
        animationClass,
        rawPercent,
        displayPercent,
        status,
        glowClass
      );
      el.appendChild(nodeHTML);

      const addBtn = this.createAddButton(node.id, onAddChild);
      el.appendChild(addBtn);

      // Add feature drawer only for features in Implementation phase or later (phaseId >= 5)
      if (node.phaseId >= 5) {
        const drawer = this.createFeatureDrawer(node.id, onDeepDive);
        el.appendChild(drawer);
      }

      // Add environment indicator
      const envIndicator = this.createEnvironmentIndicator(node.id);
      el.appendChild(envIndicator);

      container.appendChild(el);
    });
  }

  /**
   * Determine feature status based on phase and parent state
   * @param {Object} node - Feature node
   * @returns {string} 'awaiting-action' | 'blocked' | 'running' | 'completed'
   */
  getFeatureStatus(node) {
    const phase = PHASES.find((p) => p.id === node.phaseId) || PHASES[0];

    // Check if completed
    if (node.phaseId >= 8) return 'completed';

    // Check if awaiting user action
    if (phase.actionRequired) return 'awaiting-action';

    // Check if blocked by parent
    if (node.parentId) {
      const parent = this.state.nodes.find((n) => n.id === node.parentId);
      if (parent) {
        // Children can do requirements/planning (phases 0-4) but cannot enter Implementation (phase 5+)
        // until parent completes Implementation (phase 5)
        if (node.phaseId >= 5 && parent.phaseId < 5) {
          return 'blocked';
        }
      }
    }

    // Otherwise, feature is actively running
    return 'running';
  }

  createNodeHTML(
    node,
    phase,
    isSelected,
    animationClass,
    rawPercent,
    displayPercent,
    status,
    glowClass = ''
  ) {
    const nodeHTML = document.createElement('div');
    // Always use gray border - status shown via left border only
    const borderClass = isSelected ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200';
    nodeHTML.className = `w-full h-full rounded glass flex flex-col justify-between border overflow-hidden transition-all duration-200 ${glowClass} ${borderClass} ${animationClass}`;

    const content = document.createElement('div');
    content.className = 'relative flex-1 px-3 pt-2 pb-0 flex flex-col overflow-hidden bg-white';

    // Phase indicator - always gray (status shown via left border only)
    const indicatorColor = 'bg-slate-300';

    const indicator = document.createElement('div');
    indicator.className = `phase-indicator ${indicatorColor}`;
    content.appendChild(indicator);

    const header = document.createElement('div');
    header.className = 'flex justify-between items-center flex-shrink-0 mb-0.5';

    const phaseLabel = document.createElement('span');
    phaseLabel.className =
      'text-[8px] font-bold uppercase tracking-wider text-slate-400 truncate pr-2';
    phaseLabel.textContent = phase.label;
    header.appendChild(phaseLabel);

    // Status icon
    if (status === 'awaiting-action') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-user-clock text-amber-500 text-[10px] animate-pulse';
      icon.title = 'User action required';
      header.appendChild(icon);
    } else if (status === 'blocked') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-lock text-slate-400 text-[9px]';
      icon.title = 'Blocked by parent feature';
      header.appendChild(icon);
    } else if (status === 'running') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-cog fa-spin text-emerald-500 text-[9px]';
      icon.title = 'In progress';
      header.appendChild(icon);
    } else if (status === 'completed') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-check-circle text-slate-400 text-[9px]';
      icon.title = 'Completed';
      header.appendChild(icon);
    }
    content.appendChild(header);

    const title = document.createElement('h3');
    title.className = 'text-xs font-bold text-slate-700 leading-tight truncate flex-shrink-0';
    title.textContent = node.title;
    content.appendChild(title);

    const desc = document.createElement('p');
    desc.className = 'text-[9px] text-slate-400 mt-0.5 leading-tight line-clamp-1';
    desc.textContent = node.description || 'No specifications.';
    content.appendChild(desc);

    nodeHTML.appendChild(content);

    const footer = document.createElement('div');
    footer.className = 'px-3 pb-1.5 pt-1 bg-slate-50 flex-shrink-0';

    const footerTop = document.createElement('div');
    footerTop.className = 'flex justify-between items-center mb-0.5';

    const nodeId = document.createElement('span');
    nodeId.className = 'text-[8px] text-slate-400 font-mono';
    nodeId.textContent = `#${node.id.substr(-3)}`;
    footerTop.appendChild(nodeId);

    const percent = document.createElement('span');
    percent.className = 'text-[8px] text-slate-400 font-medium';
    percent.textContent = `${Math.round(rawPercent)}%`;
    footerTop.appendChild(percent);

    footer.appendChild(footerTop);

    // Show message instead of progress bar when action is required
    if (status === 'awaiting-action') {
      const actionMessage = document.createElement('div');
      actionMessage.className =
        'text-[9px] text-amber-600 font-medium text-center py-0.5 bg-amber-50 rounded';
      actionMessage.innerHTML = '<i class="fas fa-user-clock mr-1"></i>User action required';
      footer.appendChild(actionMessage);
    } else {
      // Regular progress bar for other statuses
      const progressBar = document.createElement('div');
      progressBar.className = 'w-full h-0.5 bg-slate-100 rounded-full overflow-hidden';

      // Match progress bar color to status indicator
      const progressColor =
        {
          blocked: 'bg-slate-400',
          running: 'bg-emerald-500',
          completed: 'bg-slate-400',
        }[status] || phase.color;

      const progressFill = document.createElement('div');
      progressFill.className = `h-full rounded-full ${progressColor} transition-all duration-700 ease-out`;
      progressFill.style.width = `${displayPercent}%`;
      progressBar.appendChild(progressFill);

      footer.appendChild(progressBar);
    }

    nodeHTML.appendChild(footer);

    return nodeHTML;
  }

  createAddButton(nodeId, onAddChild) {
    const addBtn = document.createElement('button');
    addBtn.className =
      'absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-all hover:shadow-lg z-20 ring-2 ring-white';

    const icon = document.createElement('i');
    icon.className = 'fas fa-plus text-[9px]';
    addBtn.appendChild(icon);

    addBtn.onclick = (e) => {
      e.stopPropagation();
      onAddChild(nodeId);
    };
    return addBtn;
  }

  createDeepDiveButton(nodeId, onDeepDive) {
    const deepDiveBtn = document.createElement('button');
    deepDiveBtn.className =
      'absolute -right-2.5 -bottom-2.5 w-5 h-5 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-all hover:shadow-lg z-20 ring-2 ring-white';
    deepDiveBtn.title = 'View tasks';

    const icon = document.createElement('i');
    icon.className = 'fas fa-search text-[9px]';
    deepDiveBtn.appendChild(icon);

    deepDiveBtn.onclick = (e) => {
      e.stopPropagation();
      onDeepDive(nodeId);
    };
    return deepDiveBtn;
  }

  createFeatureDrawer(nodeId, onDeepDive) {
    const drawer = document.createElement('div');
    drawer.className = 'feature-drawer';
    drawer.dataset.featureId = nodeId;

    // Environment button - Full width first row
    const runBtn = document.createElement('button');
    runBtn.className = 'drawer-btn run-env-btn full-width';
    runBtn.dataset.featureId = nodeId;
    runBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.startEnvironment(nodeId);
    };
    runBtn.innerHTML = '<i class="fas fa-rocket"></i><span>Start Dev Server</span>';

    drawer.appendChild(runBtn);

    // Icon-only actions - Single row
    const iconRow = document.createElement('div');
    iconRow.className = 'drawer-icon-row';

    // PR button
    const prBtn = document.createElement('button');
    prBtn.className = 'drawer-icon-btn';
    prBtn.title = 'Pull Request';
    prBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openPR(nodeId);
    };
    prBtn.innerHTML = '<i class="fab fa-github"></i>';

    // VSCode button
    const vscodeBtn = document.createElement('button');
    vscodeBtn.className = 'drawer-icon-btn';
    vscodeBtn.title = 'VSCode';
    vscodeBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openInVSCode(nodeId);
    };
    vscodeBtn.innerHTML = '<i class="fab fa-microsoft"></i>';

    // Web Preview button
    const webBtn = document.createElement('button');
    webBtn.className = 'drawer-icon-btn';
    webBtn.title = 'Web Preview';
    webBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openWebPreview(nodeId);
    };
    webBtn.innerHTML = '<i class="fas fa-globe"></i>';

    // Terminal button
    const terminalBtn = document.createElement('button');
    terminalBtn.className = 'drawer-icon-btn';
    terminalBtn.title = 'Terminal';
    terminalBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openTerminal(nodeId);
    };
    terminalBtn.innerHTML = '<i class="fas fa-terminal"></i>';

    // IDE Preview button
    const ideBtn = document.createElement('button');
    ideBtn.className = 'drawer-icon-btn';
    ideBtn.title = 'IDE Preview';
    ideBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openIDEPreview(nodeId);
    };
    ideBtn.innerHTML = '<i class="fas fa-code"></i>';

    // Deep Dive button - Highlighted icon
    const deepDiveBtn = document.createElement('button');
    deepDiveBtn.className = 'drawer-icon-btn deep-dive-icon-btn';
    deepDiveBtn.title = 'Deep Dive';
    deepDiveBtn.onclick = (e) => {
      e.stopPropagation();
      onDeepDive(nodeId);
    };
    deepDiveBtn.innerHTML = '<i class="fas fa-search"></i>';

    iconRow.appendChild(prBtn);
    iconRow.appendChild(vscodeBtn);
    iconRow.appendChild(webBtn);
    iconRow.appendChild(terminalBtn);
    iconRow.appendChild(ideBtn);
    iconRow.appendChild(deepDiveBtn);

    drawer.appendChild(iconRow);
    return drawer;
  }

  createEnvironmentIndicator(nodeId) {
    const indicator = document.createElement('div');
    indicator.className = 'env-indicator';
    indicator.dataset.featureId = nodeId;
    indicator.innerHTML = '<i class="fas fa-circle"></i>';
    return indicator;
  }

  renderNewFeatureButton(container, totalHeight, offsetY, onNewFeature) {
    const addBtnContainer = document.createElement('div');
    addBtnContainer.className = 'absolute w-[260px] h-24 node-enter';
    addBtnContainer.style.left = '50px';
    addBtnContainer.style.top = `${totalHeight + offsetY}px`;

    const newFeatureBtn = document.createElement('button');
    newFeatureBtn.className =
      'group flex flex-col items-center justify-center w-full h-full border border-dashed border-slate-200 rounded hover:border-blue-400 hover:bg-slate-50 transition-all duration-200 bg-white/40';
    newFeatureBtn.onclick = () => onNewFeature(null);

    const iconContainer = document.createElement('div');
    iconContainer.className =
      'w-6 h-6 rounded bg-slate-100 flex items-center justify-center mb-1.5 group-hover:bg-blue-600 transition-colors shadow-sm';

    const icon = document.createElement('i');
    icon.className = 'fas fa-plus text-xs text-slate-300 group-hover:text-white';
    iconContainer.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'text-slate-400 text-[10px] font-semibold group-hover:text-blue-500';
    label.textContent = 'NEW FEATURE';

    newFeatureBtn.appendChild(iconContainer);
    newFeatureBtn.appendChild(label);
    addBtnContainer.appendChild(newFeatureBtn);
    container.appendChild(addBtnContainer);
  }

  /**
   * Render tasks in the deep dive modal
   * @param {Function} onTaskClick - Callback when task is clicked
   */
  renderModal(onTaskClick) {
    const modalContainer = document.getElementById('modal-node-layer');
    const modalSvgLayer = document.getElementById('modal-connector-layer');
    modalContainer.innerHTML = '';
    modalSvgLayer.innerHTML = '';

    const tasks = this.state.getModalTasks();

    if (tasks.length === 0) {
      this.renderEmptyModalView(modalContainer);
      return;
    }

    // Sort tasks by order
    const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

    // Calculate layout (left to right flow with dependency lines)
    const startX = 100;
    const startY = 120;
    const spacing = 300;

    // Render tasks
    sortedTasks.forEach((task, index) => {
      const x = startX + index * spacing;
      const y = startY;

      const el = document.createElement('div');
      el.className = 'absolute w-[260px] group cursor-pointer node-enter';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.onclick = () => onTaskClick(task.id);

      const taskCard = this.createTaskCard(task);
      el.appendChild(taskCard);

      modalContainer.appendChild(el);
    });

    // Render dependency lines (if tasks have dependsOn)
    this.renderModalDependencies(sortedTasks, modalSvgLayer, startX, startY, spacing);
  }

  renderEmptyModalView(container) {
    const el = document.createElement('div');
    el.className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center';

    const icon = document.createElement('i');
    icon.className = 'fas fa-tasks text-slate-300 text-4xl mb-4';

    const text = document.createElement('p');
    text.className = 'text-slate-400 text-sm';
    text.textContent = 'No tasks yet for this feature';

    el.appendChild(icon);
    el.appendChild(text);
    container.appendChild(el);
  }

  renderModalDependencies(tasks, svgLayer, startX, startY, spacing) {
    // TODO: Implement dependency line rendering
    // For now, just render simple connecting lines between sequential tasks
    for (let i = 0; i < tasks.length - 1; i++) {
      const startPosX = startX + i * spacing + 260; // Right edge of current card
      const endPosX = startX + (i + 1) * spacing; // Left edge of next card
      const posY = startY + 48; // Middle of card height

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const cpx = startPosX + (endPosX - startPosX) / 2;
      path.setAttribute(
        'd',
        `M ${startPosX} ${posY} C ${cpx} ${posY}, ${cpx} ${posY}, ${endPosX} ${posY}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#e2e8f0');
      path.setAttribute('stroke-width', '1.5');
      svgLayer.appendChild(path);
    }
  }

  createTaskCard(task) {
    // Map task status to feature-like status
    const taskStatus =
      task.status === 'progress'
        ? 'running'
        : task.status === 'done'
          ? 'completed'
          : task.status === 'blocked'
            ? 'blocked'
            : 'running'; // 'todo' defaults to running

    // Calculate progress from acceptance criteria
    let progress = 0;
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      const completedCount = task.acceptanceCriteria.filter((ac) => ac.completed).length;
      progress = (completedCount / task.acceptanceCriteria.length) * 100;
    }
    const displayPercent = Math.max(5, progress);

    // Status-based styling (matching feature cards exactly)
    let animationClass = '';
    let borderColor = '';

    if (taskStatus === 'running') {
      animationClass = 'construction-progress';
      borderColor = 'border-blue-500/70';
    } else if (taskStatus === 'blocked') {
      borderColor = 'border-slate-300';
    } else if (taskStatus === 'completed') {
      borderColor = 'border-slate-300';
    }

    // Main card container
    const card = document.createElement('div');
    card.className = `w-full h-full rounded glass flex flex-col justify-between border overflow-hidden transition-all duration-200 ${borderColor} ${animationClass}`;

    // Content section
    const content = document.createElement('div');
    content.className = 'relative flex-1 px-3 pt-2 pb-0 flex flex-col overflow-hidden bg-white';

    // Top indicator (status color)
    const indicatorColor =
      {
        running: 'bg-blue-500',
        blocked: 'bg-slate-400',
        completed: 'bg-slate-400',
      }[taskStatus] || 'bg-blue-500';

    const indicator = document.createElement('div');
    indicator.className = `phase-indicator ${indicatorColor}`;
    content.appendChild(indicator);

    // Header with status label and icon
    const header = document.createElement('div');
    header.className = 'flex justify-between items-center flex-shrink-0 mb-0.5';

    const statusLabel = document.createElement('span');
    statusLabel.className =
      'text-[8px] font-bold uppercase tracking-wider text-slate-400 truncate pr-2';
    statusLabel.textContent = task.status.toUpperCase();
    header.appendChild(statusLabel);

    // Status icon
    if (taskStatus === 'blocked') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-lock text-slate-400 text-[9px]';
      icon.title = 'Blocked';
      header.appendChild(icon);
    } else if (taskStatus === 'running') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-cog fa-spin text-blue-500 text-[9px]';
      icon.title = 'In progress';
      header.appendChild(icon);
    } else if (taskStatus === 'completed') {
      const icon = document.createElement('i');
      icon.className = 'fas fa-check-circle text-slate-400 text-[9px]';
      icon.title = 'Completed';
      header.appendChild(icon);
    }
    content.appendChild(header);

    // Title
    const title = document.createElement('h3');
    title.className = 'text-xs font-bold text-slate-700 leading-tight truncate flex-shrink-0';
    title.textContent = task.title || 'Untitled Task';
    content.appendChild(title);

    // Description
    const desc = document.createElement('p');
    desc.className = 'text-[9px] text-slate-400 mt-0.5 leading-tight line-clamp-1';
    desc.textContent = task.description || 'No description.';
    content.appendChild(desc);

    // Show commits badge for completed tasks
    if (taskStatus === 'completed' && task.commits && task.commits.length > 0) {
      const commitsBadge = document.createElement('div');
      commitsBadge.className = 'flex items-center gap-1.5 mt-1.5';

      const badge = document.createElement('span');
      badge.className =
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[8px] font-semibold text-emerald-700';
      badge.innerHTML = `<i class="fas fa-code-commit text-[7px]"></i>${task.commits.length} commits`;
      commitsBadge.appendChild(badge);

      if (task.changesSummary) {
        const changesBadge = document.createElement('span');
        changesBadge.className = 'text-[8px] text-slate-400';
        changesBadge.innerHTML = `<i class="fas fa-plus text-emerald-500 text-[7px]"></i>${task.changesSummary.additions} <i class="fas fa-minus text-red-500 text-[7px] ml-0.5"></i>${task.changesSummary.deletions}`;
        commitsBadge.appendChild(changesBadge);
      }

      content.appendChild(commitsBadge);
    }

    // Show blocked reason for blocked tasks
    if (taskStatus === 'blocked' && task.blockedReason) {
      const blockedMsg = document.createElement('div');
      blockedMsg.className =
        'flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200';

      const icon = document.createElement('i');
      icon.className = 'fas fa-lock text-slate-400 text-[7px]';
      blockedMsg.appendChild(icon);

      const text = document.createElement('span');
      text.className = 'text-[8px] text-slate-600';
      text.textContent = task.blockedReason;
      blockedMsg.appendChild(text);

      content.appendChild(blockedMsg);
    }

    card.appendChild(content);

    // Footer with ID and progress
    const footer = document.createElement('div');
    footer.className = 'px-3 pb-1.5 pt-1 bg-slate-50 flex-shrink-0';

    const footerTop = document.createElement('div');
    footerTop.className = 'flex justify-between items-center mb-0.5';

    const taskId = document.createElement('span');
    taskId.className = 'text-[8px] text-slate-400 font-mono';
    taskId.textContent = `#${task.id.substr(-3)}`;
    footerTop.appendChild(taskId);

    const percent = document.createElement('span');
    percent.className = 'text-[8px] text-slate-400 font-medium';
    percent.textContent = `${Math.round(progress)}%`;
    footerTop.appendChild(percent);

    footer.appendChild(footerTop);

    // Progress bar
    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'absolute bottom-0 left-0 right-0 h-1 bg-slate-100';

    const progressBarColor =
      {
        running: 'bg-blue-500',
        blocked: 'bg-slate-400',
        completed: 'bg-slate-400',
      }[taskStatus] || 'bg-blue-500';

    const progressBar = document.createElement('div');
    progressBar.className = `h-full ${progressBarColor} transition-all duration-500`;
    progressBar.style.width = `${displayPercent}%`;
    progressBarContainer.appendChild(progressBar);

    footer.appendChild(progressBarContainer);
    card.appendChild(footer);

    return card;
  }

  /**
   * Render phases view (for Implementation phase features)
   */
  renderPhasesView(container, _svgLayer) {
    const phases = this.state.getCanvasPhases();

    if (phases.length === 0) {
      this.renderEmptyPhasesView(container);
      return;
    }

    const feature = this.state.getFeature(this.state.focusedFeatureId);
    const mergedCount = phases.filter((p) => p.status === 'merged').length;

    // Use flexbox layout (no absolute positioning = no overlaps)
    const flexContainer = document.createElement('div');
    flexContainer.className = 'flex flex-col items-start gap-0 pt-[180px] pb-24 pl-24 pr-8';

    // Feature branch card
    const branchCard = document.createElement('div');
    branchCard.className =
      'w-[600px] p-3 bg-blue-50 border-l-4 border-blue-500 rounded shadow-sm mb-6';
    branchCard.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <div class="text-[8px] font-bold uppercase tracking-wider text-blue-600">Feature Branch</div>
          <div class="text-sm font-semibold text-slate-700 mt-1">${feature?.featureBranch || 'feat/unknown'}</div>
        </div>
        <div class="text-right text-[8px] text-slate-500">
          <div>${phases.length} phases</div>
          <div>${mergedCount} merged</div>
        </div>
      </div>
    `;
    flexContainer.appendChild(branchCard);

    // Group phases by parallelGroup and order
    const groups = {};
    phases.forEach((phase) => {
      const key =
        phase.parallelGroup !== null
          ? `parallel_${phase.parallelGroup}`
          : `sequential_${phase.order}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(phase);
    });

    // Sort groups by order of first phase
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      return groups[a][0].order - groups[b][0].order;
    });

    // Render each group as a row with CSS arrow connectors between them
    sortedKeys.forEach((key, idx) => {
      // Arrow connector between groups
      if (idx > 0) {
        const arrow = document.createElement('div');
        arrow.className = 'flex flex-col items-center ml-[120px] my-1';
        arrow.innerHTML = `
          <div class="w-px h-5 bg-slate-300"></div>
          <div class="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-slate-300"></div>
        `;
        flexContainer.appendChild(arrow);
      }

      // Phase row (single card or horizontal row for parallel)
      const row = document.createElement('div');
      row.className = 'flex gap-4 flex-wrap';

      groups[key].forEach((phase) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'group cursor-pointer node-enter';
        wrapper.dataset.phaseId = phase.id;
        wrapper.appendChild(this.createPhaseCard(phase));
        row.appendChild(wrapper);
      });

      flexContainer.appendChild(row);
    });

    container.appendChild(flexContainer);
  }

  /**
   * Create a phase card (similar to task card but with more details)
   */
  createPhaseCard(phase) {
    const statusColorMap = {
      pending: 'border-slate-300',
      running: 'border-blue-500/70',
      completed: 'border-emerald-500/70',
      merged: 'border-slate-300',
    };

    const borderColor = statusColorMap[phase.status] || 'border-slate-300';
    const displayPercent = Math.max(5, phase.progress);

    const card = document.createElement('div');
    card.className = `w-[280px] rounded glass flex flex-col justify-between border overflow-hidden transition-all duration-200 ${borderColor}`;

    // Content section
    const content = document.createElement('div');
    content.className = 'relative flex-1 px-3 pt-2 pb-0 flex flex-col overflow-hidden bg-white';

    // Top bar with branch badge and TDD cycle badge
    const topBar = document.createElement('div');
    topBar.className = 'flex justify-between items-start gap-2 mb-1.5 flex-shrink-0';

    // Worktree badge (top-right)
    const worktreeBadge = document.createElement('span');
    worktreeBadge.className =
      'text-[7px] px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-600 font-semibold truncate max-w-[140px]';
    worktreeBadge.title = phase.worktree;
    worktreeBadge.textContent = `wt/${phase.name
      .replace('Phase ', '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .substring(0, 8)}`;
    topBar.appendChild(worktreeBadge);

    // TDD cycle badge (if applicable)
    if (phase.tddCycle) {
      const tddBadge = document.createElement('span');
      const tddColors = {
        RED: 'bg-red-50 border-red-200 text-red-600',
        GREEN: 'bg-emerald-50 border-emerald-200 text-emerald-600',
        REFACTOR: 'bg-blue-50 border-blue-200 text-blue-600',
      };
      tddBadge.className = `text-[7px] px-1.5 py-0.5 rounded border font-semibold ${tddColors[phase.tddCycle]}`;
      tddBadge.textContent = phase.tddCycle;
      topBar.appendChild(tddBadge);
    }

    content.appendChild(topBar);

    // Title
    const title = document.createElement('h3');
    title.className = 'text-xs font-bold text-slate-700 leading-tight truncate flex-shrink-0';
    title.textContent = phase.name;
    content.appendChild(title);

    // Description
    const desc = document.createElement('p');
    desc.className = 'text-[9px] text-slate-400 mt-0.5 leading-tight line-clamp-1';
    desc.textContent = phase.description;
    content.appendChild(desc);

    // Action items section
    const actionItemsList = this.createActionItemsList(phase.actionItems);
    content.appendChild(actionItemsList);

    // Commits section
    const commitGraph = this.createCommitGraph(phase.commits);
    content.appendChild(commitGraph);

    card.appendChild(content);

    // Footer with ID and progress
    const footer = document.createElement('div');
    footer.className = 'px-3 pb-1.5 pt-1 bg-slate-50 flex-shrink-0 relative';

    const footerTop = document.createElement('div');
    footerTop.className = 'flex justify-between items-center mb-0.5';

    const phaseId = document.createElement('span');
    phaseId.className = 'text-[8px] text-slate-400 font-mono';
    phaseId.textContent = `#${phase.id.substring(0, 8)}`;
    footerTop.appendChild(phaseId);

    const percent = document.createElement('span');
    percent.className = 'text-[8px] text-slate-400 font-medium';
    percent.textContent = `${Math.round(phase.progress)}%`;
    footerTop.appendChild(percent);

    footer.appendChild(footerTop);

    // Progress bar
    const progressBarContainer = document.createElement('div');
    progressBarContainer.className = 'absolute bottom-0 left-0 right-0 h-1 bg-slate-100';

    const progressBarColor =
      {
        pending: 'bg-slate-300',
        running: 'bg-blue-500',
        completed: 'bg-emerald-500',
        merged: 'bg-slate-400',
      }[phase.status] || 'bg-blue-500';

    const progressBar = document.createElement('div');
    progressBar.className = `h-full ${progressBarColor} transition-all duration-500`;
    progressBar.style.width = `${displayPercent}%`;
    progressBarContainer.appendChild(progressBar);

    footer.appendChild(progressBarContainer);
    card.appendChild(footer);

    // Add hover drawer for completed/merged phases
    if (phase.status === 'completed' || phase.status === 'merged') {
      const drawer = document.createElement('div');
      drawer.className =
        'absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 transform translate-y-8 opacity-0 transition-all duration-200 shadow-lg phase-drawer';

      // Row 1: Merge status (for merged phases)
      if (phase.status === 'merged') {
        const mergeInfo = document.createElement('div');
        mergeInfo.className =
          'text-[8px] text-emerald-600 font-semibold flex items-center gap-1 mb-1.5';
        const icon = document.createElement('i');
        icon.className = 'fas fa-code-merge text-[7px]';
        const text = document.createElement('span');
        text.textContent = `Merged into ${phase.mergedInto || 'feature'}`;
        mergeInfo.appendChild(icon);
        mergeInfo.appendChild(text);
        drawer.appendChild(mergeInfo);
      }

      // Row 2: Action buttons
      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-0.5';

      const actionButtons = [
        { icon: 'fa-code', label: 'VSCode', title: 'Open in VSCode' },
        { icon: 'fa-terminal', label: 'Terminal', title: 'Open terminal' },
        { icon: 'fa-code-compare', label: 'Diff', title: 'View phase diff' },
        { icon: 'fa-code-branch', label: 'Branch', title: 'Branch info' },
      ];

      actionButtons.forEach((btn) => {
        const button = document.createElement('button');
        button.className =
          'flex-1 px-1.5 py-1 text-[7px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center justify-center gap-0.5';
        button.title = btn.title;

        const icon = document.createElement('i');
        icon.className = `fas ${btn.icon} text-[7px]`;

        const label = document.createElement('span');
        label.textContent = btn.label;
        label.className = 'hidden sm:inline';

        button.appendChild(icon);
        button.appendChild(label);
        actions.appendChild(button);
      });

      drawer.appendChild(actions);
      card.appendChild(drawer);

      // Add hover effect
      card.addEventListener('mouseenter', () => {
        drawer.classList.remove('translate-y-8', 'opacity-0');
        drawer.classList.add('translate-y-0', 'opacity-100');
      });

      card.addEventListener('mouseleave', () => {
        drawer.classList.add('translate-y-8', 'opacity-0');
        drawer.classList.remove('translate-y-0', 'opacity-100');
      });
    }

    return card;
  }

  /**
   * Create action items checklist
   */
  createActionItemsList(actionItems) {
    const container = document.createElement('div');
    container.className = 'action-items-list mt-2 flex-shrink-0';

    const label = document.createElement('div');
    label.className = 'text-[7px] font-bold uppercase tracking-wider text-slate-400 mb-0.5';
    const completed = actionItems.filter((a) => a.completed).length;
    label.textContent = `Action Items: ${completed}/${actionItems.length}`;
    container.appendChild(label);

    const list = document.createElement('div');
    list.className = 'space-y-0.5 max-h-[100px] overflow-y-auto';

    actionItems.slice(0, 6).forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'text-[8px] flex items-start gap-1.5';

      const checkbox = document.createElement('span');
      checkbox.className = 'text-slate-400 flex-shrink-0 mt-0.5';
      checkbox.textContent = item.completed ? '☑' : '☐';

      const text = document.createElement('span');
      text.className = `flex-1 ${item.completed ? 'line-through text-slate-300' : 'text-slate-600'}`;
      text.textContent = item.description;

      itemEl.appendChild(checkbox);
      itemEl.appendChild(text);
      list.appendChild(itemEl);
    });

    container.appendChild(list);
    return container;
  }

  /**
   * Create commit graph (GitKraken style)
   */
  createCommitGraph(commits) {
    const container = document.createElement('div');
    container.className = 'commit-graph mt-1.5 flex-shrink-0';

    if (commits.length === 0) {
      return container;
    }

    const label = document.createElement('div');
    label.className = 'text-[7px] font-bold uppercase tracking-wider text-slate-400 mb-0.5';
    label.textContent = `Commits: ${commits.length}`;
    container.appendChild(label);

    const graph = document.createElement('div');
    graph.className = 'space-y-1 max-h-[120px] overflow-y-auto font-mono text-[8px]';

    commits.forEach((commit) => {
      const commitLine = document.createElement('div');
      commitLine.className = 'flex items-start gap-1.5 text-slate-600';

      // Commit dot with TDD phase coloring
      const dot = document.createElement('span');
      const dotColors = {
        RED: 'text-red-500',
        GREEN: 'text-emerald-500',
        REFACTOR: 'text-blue-500',
        null: 'text-slate-400',
      };
      dot.className = `flex-shrink-0 ${dotColors[commit.tddPhase || 'null']}`;
      dot.textContent = '●';

      // Commit info
      const info = document.createElement('span');
      info.className = 'flex-1 flex items-baseline gap-1';
      info.innerHTML = `
        <span class="font-semibold">${commit.sha}</span>
        <span class="text-slate-500 truncate text-[7px]">${commit.message}</span>
        <span class="text-slate-400 flex-shrink-0">${commit.timestamp}</span>
      `;

      commitLine.appendChild(dot);
      commitLine.appendChild(info);
      graph.appendChild(commitLine);

      // Sub-line with stats
      if (commit.filesChanged > 0 || commit.additions > 0 || commit.deletions > 0) {
        const statsLine = document.createElement('div');
        statsLine.className = 'flex items-center gap-2 ml-3.5 text-slate-400 text-[7px]';
        statsLine.innerHTML = `
          <span class="text-emerald-600">+${commit.additions}</span>
          <span class="text-red-600">-${commit.deletions}</span>
          <span>• ${commit.filesChanged} file${commit.filesChanged !== 1 ? 's' : ''}</span>
        `;
        graph.appendChild(statsLine);
      }
    });

    container.appendChild(graph);
    return container;
  }

  /**
   * Render dependency arrows between phases
   */
  renderPhaseDependencies(phases, positions, svgLayer) {
    // Sort phases by order to draw dependency lines
    const sortedPhases = [...phases].sort((a, b) => a.order - b.order);

    for (let i = 0; i < sortedPhases.length - 1; i++) {
      const currentPhase = sortedPhases[i];
      const nextPhase = sortedPhases[i + 1];

      const currentPos = positions.get(currentPhase.id);
      const nextPos = positions.get(nextPhase.id);

      if (!currentPos || !nextPos) continue;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      const startX = currentPos.x + 140;
      const startY = currentPos.y + 320;
      const endX = nextPos.x + 140;
      const endY = nextPos.y;

      // Bezier curve
      const cpx = startX;
      const cpy = (startY + endY) / 2;

      path.setAttribute(
        'd',
        `M ${startX} ${startY} C ${cpx} ${cpy}, ${endX} ${cpy}, ${endX} ${endY}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#cbd5e1');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('marker-end', 'url(#arrowhead)');

      svgLayer.appendChild(path);
    }

    // Add arrow marker definition if not present
    if (!svgLayer.querySelector('#arrowhead')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'arrowhead');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');

      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 10 3, 0 6');
      polygon.setAttribute('fill', '#cbd5e1');

      marker.appendChild(polygon);
      defs.appendChild(marker);
      svgLayer.appendChild(defs);
    }
  }

  /**
   * Render empty phases view
   */
  renderEmptyPhasesView(container) {
    const el = document.createElement('div');
    el.className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center';

    const icon = document.createElement('i');
    icon.className = 'fas fa-layer-group text-slate-300 text-4xl mb-4';

    const text = document.createElement('p');
    text.className = 'text-slate-400 text-sm';
    text.textContent = 'No phases yet for this feature';

    el.appendChild(icon);
    el.appendChild(text);
    container.appendChild(el);
  }

  /**
   * Render environment cards on the right side of canvas
   */
  renderEnvironmentCards() {
    const container = document.getElementById('env-cards-container');
    if (!container) return;

    container.innerHTML = '';

    // Get all running environments
    const runningEnvironments = Object.entries(this.state.featureEnvironments)
      .filter(([_, env]) => env.status === 'running')
      .map(([featureId, env]) => ({ featureId, ...env }));

    // Sort by most recent first (or just render in order)
    runningEnvironments.forEach((env) => {
      const feature = this.state.getFeature(env.featureId);
      if (!feature) return;

      const card = this.createEnvironmentCard(env, feature);
      container.appendChild(card);
    });
  }

  /**
   * Create a single environment card
   */
  createEnvironmentCard(env, feature) {
    const card = document.createElement('div');
    card.className = 'env-card';
    card.dataset.featureId = env.featureId;

    // Header with title and close button
    const header = document.createElement('div');
    header.className = 'env-card-header';

    const title = document.createElement('div');
    title.className = 'env-card-title';
    title.title = feature.title;

    const serverIcon = document.createElement('i');
    serverIcon.className = 'fas fa-server';

    const titleText = document.createElement('span');
    titleText.textContent = feature.title;
    titleText.style.overflow = 'hidden';
    titleText.style.textOverflow = 'ellipsis';
    titleText.style.whiteSpace = 'nowrap';

    title.appendChild(serverIcon);
    title.appendChild(titleText);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'env-card-close';
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeBtn.appendChild(closeIcon);
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.deleteEnvironment(env.featureId);
    };
    closeBtn.title = 'Stop and remove';

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // URL (clickable)
    const urlContainer = document.createElement('div');
    urlContainer.className = 'env-card-url';
    urlContainer.onclick = () => {
      window.app.openDesktopModal(env.featureId, env.url);
    };
    urlContainer.title = 'Click to open environment';

    const urlIcon = document.createElement('i');
    urlIcon.className = 'fas fa-link env-card-url-icon';

    const urlText = document.createElement('span');
    urlText.className = 'env-card-url-text';
    urlText.textContent = env.url;

    urlContainer.appendChild(urlIcon);
    urlContainer.appendChild(urlText);
    card.appendChild(urlContainer);

    // Actions row - Same as drawer
    const actions = document.createElement('div');
    actions.className = 'env-card-actions';

    // PR button
    const prBtn = document.createElement('button');
    prBtn.className = 'env-card-action-btn';
    prBtn.title = 'Pull Request';
    prBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openPR(env.featureId);
    };
    const prIcon = document.createElement('i');
    prIcon.className = 'fab fa-github';
    prBtn.appendChild(prIcon);

    // VSCode button
    const vscodeBtn = document.createElement('button');
    vscodeBtn.className = 'env-card-action-btn';
    vscodeBtn.title = 'VSCode';
    vscodeBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openInVSCode(env.featureId);
    };
    const vscodeIcon = document.createElement('i');
    vscodeIcon.className = 'fab fa-microsoft';
    vscodeBtn.appendChild(vscodeIcon);

    // Web Preview button
    const webBtn = document.createElement('button');
    webBtn.className = 'env-card-action-btn';
    webBtn.title = 'Web Preview';
    webBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openWebPreview(env.featureId);
    };
    const webIcon = document.createElement('i');
    webIcon.className = 'fas fa-globe';
    webBtn.appendChild(webIcon);

    // Terminal button
    const terminalBtn = document.createElement('button');
    terminalBtn.className = 'env-card-action-btn';
    terminalBtn.title = 'Terminal';
    terminalBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openTerminal(env.featureId);
    };
    const terminalIcon = document.createElement('i');
    terminalIcon.className = 'fas fa-terminal';
    terminalBtn.appendChild(terminalIcon);

    // IDE Preview button
    const ideBtn = document.createElement('button');
    ideBtn.className = 'env-card-action-btn';
    ideBtn.title = 'IDE Preview';
    ideBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openIDEPreview(env.featureId);
    };
    const ideIcon = document.createElement('i');
    ideIcon.className = 'fas fa-code';
    ideBtn.appendChild(ideIcon);

    // Deep Dive button - Highlighted
    const deepDiveBtn = document.createElement('button');
    deepDiveBtn.className = 'env-card-action-btn deep-dive';
    deepDiveBtn.title = 'Deep Dive';
    deepDiveBtn.onclick = (e) => {
      e.stopPropagation();
      window.app.openDeepDive(env.featureId);
    };
    const deepDiveIcon = document.createElement('i');
    deepDiveIcon.className = 'fas fa-layer-group';
    deepDiveBtn.appendChild(deepDiveIcon);

    actions.appendChild(prBtn);
    actions.appendChild(vscodeBtn);
    actions.appendChild(webBtn);
    actions.appendChild(terminalBtn);
    actions.appendChild(ideBtn);
    actions.appendChild(deepDiveBtn);
    card.appendChild(actions);

    // Footer with ID and port
    const footer = document.createElement('div');
    footer.className = 'env-card-footer';

    const id = document.createElement('span');
    id.className = 'env-card-id';
    id.textContent = `#${env.featureId.substr(-3)}`;

    const port = document.createElement('span');
    port.className = 'env-card-port';
    port.textContent = `PORT ${env.port}`;

    footer.appendChild(id);
    footer.appendChild(port);
    card.appendChild(footer);

    return card;
  }
}
