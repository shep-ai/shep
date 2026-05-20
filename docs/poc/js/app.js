import { PHASES, PRESETS } from './constants.js';
import { AppState } from './state.js';
import { LayoutEngine } from './layout.js';
import { UIManager } from './ui.js';
import { Renderer } from './renderer.js';
import {
  getOverviewTabHTML,
  getTasksTabHTML,
  getActivityTabHTML,
  getSettingsTabHTML,
} from './templates.js';

class App {
  constructor() {
    this.state = new AppState();
    this.layout = new LayoutEngine();
    this.ui = new UIManager();
    this.renderer = new Renderer(this.state, this.layout);
    this.sidebarMode = 'edit';
    this.pendingParentId = null;
    this.isModalPanelOpen = false;
  }

  init() {
    this.render();
    this.ui.setupDragScroll();
    document
      .getElementById('confirm-yes-btn')
      .addEventListener('click', () => this.ui.handleConfirmYes());
    window.addEventListener('resize', () => this.render());

    // Setup escape key handling (onion layers)
    document.addEventListener('keydown', (e) => this.handleEscapeKey(e));

    // Setup click outside sidebar to close
    document.addEventListener('click', (e) => this.handleClickOutside(e));

    // Render environment cards (shows persisted running environments)
    this.renderer.renderEnvironmentCards();

    // Auto-start realistic simulation (always on)
    this.startSimulation();
  }

  handleClickOutside(e) {
    const sidePanel = document.getElementById('side-panel');
    const isPanelOpen = !sidePanel.classList.contains('translate-x-full');

    if (!isPanelOpen) return;

    // Check if click is outside the panel
    const isClickInsidePanel = sidePanel.contains(e.target);
    const isClickOnCard = e.target.closest('.glass');
    const isClickOnButton = e.target.closest('button');

    // Close if clicking outside panel (but not on cards or buttons that open it)
    if (!isClickInsidePanel && !isClickOnCard && !isClickOnButton) {
      this.closePanel();
    }
  }

  // Tab Management
  switchTab(tabName, event) {
    this.state.currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
    event.target.closest('.tab-btn').classList.add('active');
    this.renderTabContent(tabName);

    // Hide action bar on action tab
    const actionBar = document.getElementById('action-bar');
    if (actionBar) {
      actionBar.style.display = tabName === 'action' ? 'none' : 'flex';
    }
  }

  renderTabContent(tabName) {
    const container = document.getElementById('tab-container');
    if (tabName === 'action') {
      this.renderUserActionTab();
      return;
    }
    const templates = {
      overview: getOverviewTabHTML(),
      tasks: getTasksTabHTML(),
      activity: getActivityTabHTML(),
      settings: getSettingsTabHTML(),
    };
    container.innerHTML = templates[tabName] || templates.overview;
  }

  renderUserActionTab() {
    const feature = this.state.getFeature(this.state.selectedNodeId);
    if (!feature) return;

    const actionDetails = this.state.getUserActionDetails(this.state.selectedNodeId);
    if (!actionDetails) return;

    const container = document.getElementById('tab-container');

    // Render based on action type
    if (actionDetails.type === 'questionnaire') {
      // PRD Questionnaire
      container.innerHTML = `
                <div class="flex flex-col h-full">
                    <div class="flex-1 overflow-y-auto p-4 space-y-4">
                        <div class="flex items-start gap-3 pb-3 border-b border-slate-200">
                            <div class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"></div>
                            <div class="flex-1">
                                <h3 class="text-sm font-bold text-slate-800 mb-1.5">${actionDetails.question}</h3>
                                <p class="text-xs text-slate-600 leading-relaxed">${actionDetails.context}</p>
                            </div>
                        </div>
                        ${actionDetails.questions
                          .map((q, idx) => {
                            return `
                            <div class="space-y-2">
                                <label class="text-[10px] font-bold text-slate-600 block">${idx + 1}. ${q.question}</label>
                                <div class="space-y-1.5">
                                    ${q.options
                                      .map(
                                        (opt, optIdx) => `
                                        <button onclick="app.selectQuestionOption('${q.id}', '${opt.id}')"
                                                class="w-full text-left px-3 py-2 rounded border ${opt.recommended ? 'border-blue-500 bg-blue-50' : 'border-slate-200'} hover:border-blue-400 hover:bg-blue-50 transition-all text-[10px] group ${opt.isNew ? 'option-highlight' : ''}"
                                                data-question="${q.id}" data-option="${opt.id}">
                                            <div class="flex items-start gap-2">
                                                <span class="text-slate-400 font-mono text-[9px] mt-0.5">${String.fromCharCode(65 + optIdx)}.</span>
                                                <div class="flex-1">
                                                    <div class="flex items-center gap-2 mb-0.5">
                                                        <span class="font-semibold text-slate-800">${opt.label}</span>
                                                        ${opt.recommended ? '<span class="text-[8px] px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold uppercase tracking-wide">AI Recommended</span>' : ''}
                                                        ${opt.isNew ? '<span class="text-[8px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold uppercase tracking-wide">✨ New</span>' : ''}
                                                    </div>
                                                    <div class="text-slate-500 text-[9px] leading-tight">${opt.rationale}</div>
                                                </div>
                                            </div>
                                        </button>
                                    `
                                      )
                                      .join('')}
                                </div>
                            </div>
                        `;
                          })
                          .join('')}
                    </div>
                    <!-- Prompt + Approve Button -->
                    <div id="prd-action-bar" class="flex-shrink-0 bg-white border-t border-slate-200">
                        <div id="prd-progress-bar" class="h-1 bg-slate-100 overflow-hidden opacity-0 transition-opacity duration-200">
                            <div class="h-full bg-blue-600 transition-all duration-300" style="width: 0%"></div>
                        </div>
                        <div class="p-3 flex items-center gap-2">
                            <input id="prd-prompt-input" type="text" placeholder="Ask AI to refine requirements..."
                                   class="flex-1 px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                            <button onclick="app.submitPrdPrompt('${this.state.selectedNodeId}')"
                                    class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded transition-all flex items-center gap-1.5">
                                <i class="fas fa-paper-plane text-[10px]"></i>Send
                            </button>
                            <button onclick="app.handleUserAction('${this.state.selectedNodeId}', 'approve')"
                                    class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-6 py-2 rounded transition-all flex items-center gap-1.5 shadow-sm">
                                <i class="fas fa-check text-[10px]"></i>${actionDetails.finalAction.label}
                            </button>
                        </div>
                    </div>
                </div>
            `;
    } else if (actionDetails.type === 'technical_review') {
      // Technical Review - Rich content with overview, docs first, then decisions
      const approveOption = actionDetails.options.find((opt) => opt.color === 'emerald');
      container.innerHTML = `
                <div class="flex flex-col h-full">
                    <div class="flex-1 overflow-y-auto p-4 space-y-4">
                        <!-- Header -->
                        <div class="flex items-start gap-3 pb-3 border-b border-slate-200">
                            <div class="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5"></div>
                            <div class="flex-1">
                                <h3 class="text-sm font-bold text-slate-800 mb-1.5">${actionDetails.question}</h3>
                                <p class="text-xs text-slate-600 leading-relaxed">${actionDetails.context}</p>
                            </div>
                        </div>

                        <!-- Implementation Overview -->
                        ${
                          actionDetails.overview
                            ? `
                            <div class="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded p-4">
                                <div class="flex items-center gap-2 mb-2.5">
                                    <i class="fas fa-lightbulb text-indigo-600 text-xs"></i>
                                    <span class="text-xs font-bold text-indigo-900">Implementation Strategy</span>
                                </div>
                                <p class="text-[10px] text-indigo-800 leading-relaxed mb-3">${actionDetails.overview.summary}</p>
                                <div class="space-y-1.5">
                                    ${actionDetails.overview.highlights
                                      .map(
                                        (hl) => `
                                        <div class="flex items-start gap-2">
                                            <div class="w-1 h-1 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5"></div>
                                            <span class="text-[10px] text-indigo-900 leading-snug">${hl}</span>
                                        </div>
                                    `
                                      )
                                      .join('')}
                                </div>
                            </div>
                        `
                            : ''
                        }

                        <!-- Technical Decisions -->
                        <div class="space-y-3">
                            <div class="flex items-center gap-2">
                                <i class="fas fa-diagram-project text-slate-400 text-xs"></i>
                                <span class="text-xs font-bold text-slate-700">Technical Decisions</span>
                            </div>
                            ${actionDetails.decisions
                              .map(
                                (decision, idx) => `
                                <div class="bg-white border border-slate-200 rounded p-3.5 space-y-2.5">
                                    <!-- Decision Header -->
                                    <div class="flex items-start gap-2.5">
                                        <div class="decision-number-badge">${idx + 1}</div>
                                        <div class="flex-1">
                                            <div class="flex items-center justify-between mb-1.5">
                                                <span class="text-xs font-bold text-slate-700">${decision.aspect}</span>
                                                <span class="text-xs px-2.5 py-1 rounded bg-indigo-100 text-indigo-700 font-semibold">${decision.selected}</span>
                                            </div>
                                            <p class="text-[10px] text-slate-600 leading-tight mb-2">${decision.rationale}</p>
                                            <div class="flex items-center gap-2">
                                                <a href="#" class="text-[9px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
                                                    <i class="fas fa-book text-[8px]"></i>Read research.md
                                                </a>
                                                <span class="text-slate-300">•</span>
                                                <a href="#" class="text-[9px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1">
                                                    <i class="fas fa-map text-[8px]"></i>View in plan.md
                                                </a>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Pros & Cons -->
                                    <div class="grid grid-cols-2 gap-2.5">
                                        <div class="space-y-1">
                                            <div class="flex items-center gap-1.5 mb-1">
                                                <i class="fas fa-check text-emerald-500 text-[9px]"></i>
                                                <span class="text-[10px] font-bold text-slate-700">Pros</span>
                                            </div>
                                            ${decision.pros
                                              .map(
                                                (pro) => `
                                                <div class="flex items-start gap-1.5">
                                                    <div class="w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0 mt-1"></div>
                                                    <span class="text-[10px] text-slate-600 leading-snug">${pro}</span>
                                                </div>
                                            `
                                              )
                                              .join('')}
                                        </div>
                                        <div class="space-y-1">
                                            <div class="flex items-center gap-1.5 mb-1">
                                                <i class="fas fa-times text-red-500 text-[9px]"></i>
                                                <span class="text-[10px] font-bold text-slate-700">Cons</span>
                                            </div>
                                            ${decision.cons
                                              .map(
                                                (con) => `
                                                <div class="flex items-start gap-1.5">
                                                    <div class="w-1 h-1 rounded-full bg-red-400 flex-shrink-0 mt-1"></div>
                                                    <span class="text-[10px] text-slate-600 leading-snug">${con}</span>
                                                </div>
                                            `
                                              )
                                              .join('')}
                                        </div>
                                    </div>

                                    <!-- Alternatives -->
                                    <div class="pt-2 border-t border-slate-100">
                                        <div class="flex items-center gap-1.5 mb-1.5">
                                            <i class="fas fa-layer-group text-slate-400 text-[9px]"></i>
                                            <span class="text-[10px] font-bold text-slate-700">Other Options Considered</span>
                                        </div>
                                        <div class="space-y-1.5">
                                            ${decision.alternatives
                                              .map(
                                                (alt) => `
                                                <div class="bg-slate-50 rounded px-2.5 py-2">
                                                    <div class="flex items-center justify-between mb-0.5">
                                                        <div class="text-[10px] font-semibold text-slate-700">${alt.option}</div>
                                                        <a href="#" class="text-[9px] text-slate-500 hover:text-blue-600 font-medium flex items-center gap-1">
                                                            <i class="fas fa-external-link-alt text-[7px]"></i>Details
                                                        </a>
                                                    </div>
                                                    <div class="text-[9px] text-slate-500 leading-snug">${alt.why_not}</div>
                                                </div>
                                            `
                                              )
                                              .join('')}
                                        </div>
                                    </div>
                                </div>
                            `
                              )
                              .join('')}
                        </div>

                        <!-- Documents Section (Last) -->
                        ${
                          actionDetails.documents && actionDetails.documents.length > 0
                            ? `
                            <div class="border-t border-slate-200 pt-4">
                                <div class="flex items-center gap-2 mb-3">
                                    <i class="fas fa-folder-open text-slate-400 text-xs"></i>
                                    <span class="text-xs font-bold text-slate-700">Generated Documents</span>
                                    <span class="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">${actionDetails.documents.length}</span>
                                </div>
                                <div class="grid grid-cols-1 gap-2">
                                    ${actionDetails.documents
                                      .map(
                                        (doc) => `
                                        <div onclick="app.openDocument('${doc.name}')" class="bg-white border border-slate-200 hover:border-${doc.color}-300 rounded p-3 transition-colors cursor-pointer group">
                                            <div class="flex items-start gap-3">
                                                <div class="w-8 h-8 rounded bg-${doc.color}-50 flex items-center justify-center flex-shrink-0">
                                                    <i class="fas ${doc.icon} text-${doc.color}-600 text-xs"></i>
                                                </div>
                                                <div class="flex-1 min-w-0">
                                                    <div class="flex items-center justify-between mb-1">
                                                        <span class="text-xs font-semibold text-slate-800 group-hover:text-${doc.color}-700 transition-colors">${doc.name}</span>
                                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-${doc.color}-100 text-${doc.color}-700 font-semibold">${doc.type}</span>
                                                    </div>
                                                    <p class="text-[10px] text-slate-500 leading-snug">${doc.description}</p>
                                                </div>
                                                <i class="fas fa-chevron-right text-slate-300 group-hover:text-${doc.color}-500 text-xs transition-colors"></i>
                                            </div>
                                        </div>
                                    `
                                      )
                                      .join('')}
                                </div>
                            </div>
                        `
                            : ''
                        }
                    </div>

                    <!-- Prompt + Approve Button -->
                    <div id="plan-action-bar" class="flex-shrink-0 bg-white border-t border-slate-200">
                        <div id="plan-progress-bar" class="h-1 bg-slate-100 overflow-hidden opacity-0 transition-opacity duration-200">
                            <div class="h-full bg-blue-600 transition-all duration-300" style="width: 0%"></div>
                        </div>
                        <div class="p-3 flex items-center gap-2">
                            <input id="plan-prompt-input" type="text" placeholder="Ask AI to rethink technical decisions..."
                                   class="flex-1 px-3 py-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500" />
                            <button onclick="app.submitPlanPrompt('${this.state.selectedNodeId}')"
                                    class="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-4 py-2 rounded transition-all flex items-center gap-1.5">
                                <i class="fas fa-paper-plane text-[10px]"></i>Send
                            </button>
                            <button onclick="app.handleUserAction('${this.state.selectedNodeId}', '${approveOption?.id || 'approve'}')"
                                    class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-6 py-2 rounded transition-all flex items-center gap-1.5 shadow-sm">
                                <i class="fas fa-check text-[10px]"></i>${approveOption?.label || 'Approve Technical Plan'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
    } else if (actionDetails.type === 'qa_review') {
      // QA Review
      const approveOption = actionDetails.options.find((opt) => opt.color === 'emerald');
      container.innerHTML = `
                <div class="flex flex-col h-full">
                    <div class="flex-1 overflow-y-auto p-4 space-y-4">
                        <div class="flex items-start gap-3 pb-3 border-b border-slate-200">
                            <div class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"></div>
                            <div class="flex-1">
                                <h3 class="text-sm font-bold text-slate-800 mb-1.5">${actionDetails.question}</h3>
                                <p class="text-xs text-slate-600 leading-relaxed">${actionDetails.context}</p>
                            </div>
                        </div>
                        <div class="bg-white border border-slate-200 rounded p-3 space-y-2">
                            ${actionDetails.checklist
                              .map(
                                (check) => `
                                <div class="flex items-start gap-2">
                                    <i class="fas ${check.status === 'pass' ? 'fa-check-circle text-emerald-500' : check.status === 'warning' ? 'fa-exclamation-triangle text-amber-500' : 'fa-times-circle text-red-500'} text-xs mt-0.5"></i>
                                    <div class="flex-1">
                                        <div class="text-[10px] font-semibold text-slate-700">${check.item}</div>
                                        <div class="text-[9px] text-slate-500">${check.details}</div>
                                    </div>
                                </div>
                            `
                              )
                              .join('')}
                        </div>
                    </div>
                    <!-- Sticky Approve Button - Sleeker Design -->
                    <div class="flex-shrink-0 bg-white border-t border-slate-200 p-3">
                        <button onclick="app.handleUserAction('${this.state.selectedNodeId}', '${approveOption?.id || 'approve'}')"
                                class="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded transition-all flex items-center justify-center gap-1.5">
                            <i class="fas fa-check text-[10px]"></i>${approveOption?.label || 'Approve & Continue'}
                        </button>
                    </div>
                </div>
            `;
    } else if (actionDetails.type === 'deployment') {
      // Deployment Approval
      const approveOption = actionDetails.options.find((opt) => opt.color === 'emerald');
      container.innerHTML = `
                <div class="flex flex-col h-full">
                    <div class="flex-1 overflow-y-auto p-4 space-y-4">
                        <div class="flex items-start gap-3 pb-3 border-b border-slate-200">
                            <div class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"></div>
                            <div class="flex-1">
                                <h3 class="text-sm font-bold text-slate-800 mb-1.5">${actionDetails.question}</h3>
                                <p class="text-xs text-slate-600 leading-relaxed">${actionDetails.context}</p>
                            </div>
                        </div>
                        <div class="bg-white border border-slate-200 rounded p-3">
                            <div class="text-[10px] font-bold text-slate-600 mb-2">Deployment Readiness</div>
                            <div class="space-y-1.5">
                                ${actionDetails.readiness
                                  .map(
                                    (check) => `
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-check-circle text-emerald-500 text-xs"></i>
                                        <span class="text-[10px] text-slate-700">${check.check}</span>
                                    </div>
                                `
                                  )
                                  .join('')}
                            </div>
                        </div>
                    </div>
                    <!-- Sticky Approve Button - Sleeker Design -->
                    <div class="flex-shrink-0 bg-white border-t border-slate-200 p-3">
                        <button onclick="app.handleUserAction('${this.state.selectedNodeId}', '${approveOption?.id || 'approve'}')"
                                class="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded transition-all flex items-center justify-center gap-1.5">
                            <i class="fas fa-check text-[10px]"></i>${approveOption?.label || 'Deploy to Production'}
                        </button>
                    </div>
                </div>
            `;
    }
  }

  selectQuestionOption(questionId, optionId) {
    // Visual feedback for selected option
    const buttons = document.querySelectorAll(`[data-question="${questionId}"]`);
    buttons.forEach((btn) => {
      if (btn.dataset.option === optionId) {
        btn.classList.add('border-blue-500', 'bg-blue-50');
        btn.classList.remove('border-slate-200');
      } else {
        btn.classList.remove('border-blue-500', 'bg-blue-50');
        btn.classList.add('border-slate-200');
      }
    });
  }

  // Realistic Always-On Simulation
  startSimulation() {
    // Initialize progress for all features
    this.state.nodes.forEach((node) => {
      if (!this.state.phaseProgress[node.id]) {
        this.state.setGranularProgress(node.id, node.phaseId, 0);
      }
    });

    // Fast simulation: ~5 seconds per phase, with 10 sub-steps = 500ms per sub-step
    this.state.simulationInterval = setInterval(() => this.runSimulationStep(), 500);
  }

  /**
   * Progress implementation phases (runs during phase 5)
   * Handles phase progression, merging, and feature phase advancement
   */
  progressImplementationPhases() {
    // Find features in Implementation phase (phase 5)
    const implementationFeatures = this.state.nodes.filter((n) => n.phaseId === 5);

    implementationFeatures.forEach((feature) => {
      // Generate phases on first Implementation entry
      if (!feature.phases || feature.phases.length === 0) {
        this.state.generatePhasesForFeature(feature.id);
        this.render();
        return;
      }

      // Find phases that can progress
      const runnablePhases = feature.phases.filter((phase) => {
        if (phase.status === 'completed' || phase.status === 'merged') return false;

        if (phase.status === 'pending') {
          // Check if dependencies are met
          if (phase.order === 0) {
            // First phase can always start
            this.state.updatePhase(feature.id, phase.id, { status: 'running' });
            return true;
          }

          // All phases with a LOWER order must be merged before this one can start
          const prevOrderPhases = feature.phases.filter((p) => p.order < phase.order);
          const allPrevMerged = prevOrderPhases.every((p) => p.status === 'merged');

          if (allPrevMerged) {
            // Start this phase (parallel phases with same order all start together)
            this.state.updatePhase(feature.id, phase.id, { status: 'running' });
            return true;
          }
          return false;
        }

        return phase.status === 'running';
      });

      // Progress one random running phase
      if (runnablePhases.length > 0) {
        const phase = runnablePhases[Math.floor(Math.random() * runnablePhases.length)];
        this.state.progressPhase(feature.id, phase.id);
      }

      // Check if all phases merged -> move to QA
      const allMerged = feature.phases.every((p) => p.status === 'merged');
      if (allMerged && feature.phaseId === 5) {
        this.state.updateFeature(feature.id, { phaseId: 6 }); // Move to QA Check
        console.log('✅ All phases merged! Feature moving to QA Check phase');
        this.render();
      }
    });

    // Re-render if in phases view
    if (this.state.viewMode === 'phases') {
      this.render();
    }
  }

  /**
   * Update a phase (helper for simulation)
   * Not used here but might be needed elsewhere
   */
  // Note: Already implemented in state.js

  runSimulationStep() {
    // NEW: Progress implementation phases first
    this.progressImplementationPhases();

    // Find features that can progress (not waiting for user action, not complete)
    const candidates = this.state.nodes.filter((n) => {
      const phase = PHASES.find((p) => p.id === n.phaseId);

      // Skip if waiting for user action
      if (phase && phase.actionRequired) return false;

      // Skip if already at final phase
      if (n.phaseId >= 8) return false;

      // Skip Implementation phase - handled by progressImplementationPhases()
      if (n.phaseId === 5) return false;

      // Children can do requirements/planning (phases 0-4) but cannot enter Implementation (phase 5+)
      // until parent completes Implementation (phase 5)
      if (n.parentId) {
        const parent = this.state.getNode(n.parentId);
        // Block child from entering Implementation if parent hasn't reached Implementation yet
        if (parent && parent.phaseId < 5 && n.phaseId >= 5) return false;
      }

      return true;
    });

    if (candidates.length === 0) return;

    // Pick a random feature to progress
    const feature = candidates[Math.floor(Math.random() * candidates.length)];
    const progress = this.state.getGranularProgress(feature.id);

    // Increment sub-progress (0-100 within each phase)
    let newSubProgress = progress.subProgress + 10;

    if (newSubProgress >= 100) {
      // Move to next phase
      const newPhase = feature.phaseId + 1;
      const phaseInfo = PHASES.find((p) => p.id === newPhase);

      // Double-check blocking rule: prevent child from entering Implementation if parent hasn't
      if (feature.parentId && newPhase >= 5) {
        const parent = this.state.getNode(feature.parentId);
        if (parent && parent.phaseId < 5) {
          console.log(
            `🔒 "${feature.title}" blocked from Implementation - waiting for parent "${parent.title}" to complete Implementation`
          );
          return; // Don't advance, stay at current phase
        }
      }

      // Update feature phase
      const updated = this.state.updateFeature(feature.id, { phaseId: newPhase });
      if (updated) {
        this.state.addActivityEvent(updated, 'phase_change', `Moved to ${phaseInfo.label} phase`);
        this.state.save();
      }

      // Reset sub-progress for new phase
      this.state.setGranularProgress(feature.id, newPhase, 0);

      // Generate tasks after Requirements phase (phase 1) or Planning phase (phase 3)
      if (newPhase === 1 || newPhase === 3) {
        this.state.generateTasksForFeature(feature.id);
      }

      // If entering user action required phase, highlight it
      if (phaseInfo && phaseInfo.actionRequired) {
        console.log(`⏸️ Feature "${feature.title}" waiting for user action: ${phaseInfo.label}`);
      }

      // Only full render on phase change (significant update)
      this.render();
    } else {
      // Update sub-progress within current phase
      this.state.setGranularProgress(feature.id, feature.phaseId, newSubProgress);

      // Efficient update: only update progress bar without full re-render
      this.updateProgressBar(feature.id);
    }
  }

  /**
   * Update only the progress bar for a specific feature (no DOM rebuild)
   * @param {string} featureId - Feature ID
   */
  updateProgressBar(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    // Find the feature element by data attribute
    const featureElement = document.querySelector(`[data-feature-id="${featureId}"]`);
    if (!featureElement) return;

    // Find the progress bar within this feature element
    const progressBar = featureElement.querySelector(
      '.absolute.bottom-0.left-0.right-0.h-1 > .h-full'
    );
    if (!progressBar) return;

    // Get current progress
    const granularProgress = this.state.getGranularProgress(featureId);
    const displayPercent = Math.max(5, granularProgress.totalProgress);

    // Update progress bar width smoothly
    progressBar.style.width = `${displayPercent}%`;
  }

  // Panel Management
  initCreate(parentId) {
    this.sidebarMode = 'create';
    this.pendingParentId = parentId;

    // Hide tabs that don't make sense in create mode
    const actionTab = document.getElementById('action-tab-btn');
    const tasksTabBtn = document.getElementById('tasks-tab-btn');

    actionTab.classList.add('hidden');
    tasksTabBtn?.classList.add('hidden');

    // Get preset suggestion for quick demo
    const preset = PRESETS[this.state.presetIndex];
    this.state.presetIndex = (this.state.presetIndex + 1) % PRESETS.length;

    this.renderTabContent('overview');

    // Pre-fill form with preset suggestion (for demo convenience)
    const titleInput = document.getElementById('input-title');
    const descInput = document.getElementById('input-desc');

    titleInput.value = preset.title;
    descInput.value = preset.description;

    // Make sure fields are editable in create mode
    titleInput.removeAttribute('readonly');
    descInput.removeAttribute('readonly');

    const prioritySelect = document.getElementById('input-priority');
    if (prioritySelect) {
      prioritySelect.value = preset.priority;
    }

    this.populatePhaseSelect(parentId);
    document.getElementById('panel-title').innerText = 'NEW FEATURE';
    document.getElementById('panel-id-display').innerText = 'Creating...';

    // Activate Overview tab
    document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
    document.getElementById('overview-tab-btn')?.classList.add('active');

    // Show create actions, hide edit actions
    document.getElementById('create-actions').classList.remove('hidden');
    document.getElementById('edit-actions').classList.add('hidden');

    // Show action bar in create mode
    const actionBar = document.getElementById('action-bar');
    if (actionBar) {
      actionBar.style.display = 'flex';
    }

    document.getElementById('side-panel').classList.remove('translate-x-full');
  }

  populatePhaseSelect(parentId) {
    const phaseSelect = document.getElementById('input-phase');
    let maxPhase = 8;
    const parent = parentId ? this.state.getNode(parentId) : null;
    phaseSelect.innerHTML = '';
    if (parent && parent.phaseId < 7) maxPhase = 1;
    PHASES.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.text = p.label;
      if (p.id > maxPhase) opt.disabled = true;
      phaseSelect.appendChild(opt);
    });
    phaseSelect.value = 0;
  }

  openEdit(nodeId) {
    this.state.selectedNodeId = nodeId;
    const feature = this.state.getFeature(nodeId);

    if (!feature) {
      this.ui.showToast('Feature not found', true);
      return;
    }

    // Show/hide tabs based on phase and action requirement
    const actionTab = document.getElementById('action-tab-btn');
    const actionTabLabel = document.getElementById('action-tab-label');
    const tasksTabBtn = document.getElementById('tasks-tab-btn');
    const isActionRequired = this.state.isWaitingForUserAction(nodeId);
    const phase = PHASES.find((p) => p.id === feature.phaseId);

    // Hide Tasks tab before planning phase (phaseId < 3)
    if (feature.phaseId < 3) {
      tasksTabBtn?.classList.add('hidden');
    } else {
      tasksTabBtn?.classList.remove('hidden');
    }

    if (isActionRequired) {
      // Show action tab with specific label for all action-required phases
      actionTab.classList.remove('hidden');
      this.state.currentTab = 'action';

      // Update action tab label to show what's required
      const actionLabel = phase?.label || 'Action';
      if (actionTabLabel) {
        actionTabLabel.textContent = `Action Required: ${actionLabel}`;
      }

      document.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
      actionTab.classList.add('active');
    } else {
      actionTab.classList.add('hidden');
      this.state.currentTab = 'overview';
    }

    // Regular edit mode
    this.sidebarMode = 'edit';
    this.renderTabContent(this.state.currentTab);

    // Populate form from feature data (following schema)
    // Only populate if NOT showing action tab (it has no form fields)
    if (this.state.currentTab !== 'action') {
      const titleInput = document.getElementById('input-title');
      const descInput = document.getElementById('input-desc');

      titleInput.value = feature.title;
      descInput.value = feature.description || '';

      // Make Overview tab read-only in edit mode
      titleInput.setAttribute('readonly', 'true');
      descInput.setAttribute('readonly', 'true');

      // Format dates nicely
      const createdDate = new Date(feature.createdAt).toLocaleDateString();
      const updatedDate = new Date(feature.updatedAt).toLocaleDateString();
      document.getElementById('input-date').textContent = createdDate;
      document.getElementById('input-updated').textContent = updatedDate;

      // Set priority
      const prioritySelect = document.getElementById('input-priority');
      if (prioritySelect) {
        prioritySelect.value = feature.priority;
      }

      document.getElementById('panel-id-display').innerText =
        `ID: #${feature.id.substr(-4).toUpperCase()}`;
      this.populatePhaseSelect(feature.parentId);
      document.getElementById('input-phase').value = feature.phaseId;
    }

    document.getElementById('panel-title').innerText = 'PROPERTIES';

    // Show edit actions, hide create actions
    document.getElementById('edit-actions').classList.remove('hidden');
    document.getElementById('create-actions').classList.add('hidden');

    // Hide action bar on action tab
    const actionBar = document.getElementById('action-bar');
    if (actionBar) {
      actionBar.style.display = this.state.currentTab === 'action' ? 'none' : 'flex';
    }

    document.getElementById('side-panel').classList.remove('translate-x-full');
  }

  closePanel() {
    this.state.selectedNodeId = null;
    document.getElementById('side-panel').classList.add('translate-x-full');
    // Hide action tab
    document.getElementById('action-tab-btn').classList.add('hidden');
    // Reset action bar visibility
    const actionBar = document.getElementById('action-bar');
    if (actionBar) {
      actionBar.style.display = 'flex';
    }
    this.render();
  }

  handleSidebarAction() {
    const title = document.getElementById('input-title').value;
    const desc = document.getElementById('input-desc').value;
    const phaseId = parseInt(document.getElementById('input-phase').value);
    const priority = document.getElementById('input-priority')?.value || 'medium';

    if (!title.trim()) {
      this.ui.showToast('Name Required', true);
      return;
    }

    if (this.sidebarMode === 'create') {
      // Determine repositoryId: from pending repo, parent's repo, or first repo
      let repositoryId = this.pendingRepoId || null;
      if (!repositoryId && this.pendingParentId) {
        const parent = this.state.getFeature(this.pendingParentId);
        if (parent) repositoryId = parent.repositoryId;
      }
      if (!repositoryId) {
        const repos = this.state.getRepositories();
        if (repos.length > 0) repositoryId = repos[0].id;
      }
      this.pendingRepoId = null;

      // CREATE - Use schema-based factory
      const feature = this.state.createFeature({
        parentId: this.pendingParentId,
        repositoryId,
        title: title.trim(),
        description: desc.trim(),
        phaseId,
        priority,
        tags: [], // TODO: Extract from UI
        tasks: [],
        settings: {
          notifications: true,
          autoAssignTasks: false,
          visibility: 'team',
          archived: false,
        },
      });

      if (feature) {
        this.ui.showToast('Feature Created');
        this.state.save();
      } else {
        this.ui.showToast('Failed to create feature', true);
        return;
      }
    } else {
      // UPDATE - Use schema-based update
      const updated = this.state.updateFeature(this.state.selectedNodeId, {
        title: title.trim(),
        description: desc.trim(),
        phaseId,
        priority,
      });

      if (updated) {
        // Add update activity event
        this.state.addActivityEvent(updated, 'description_update', 'Updated feature details');
        this.state.save();
        this.ui.showToast('Feature Updated');
      } else {
        this.ui.showToast('Failed to update feature', true);
        return;
      }
    }

    this.closePanel();
    this.render();
  }

  // Node Management
  deleteCurrentNode() {
    this.ui.showConfirm('Delete this feature and all children?', () => {
      const feature = this.state.getFeature(this.state.selectedNodeId);
      if (feature) {
        this.state.deleteFeature(this.state.selectedNodeId);
        this.closePanel();
        this.ui.showToast('Feature Deleted');
        this.render();
      }
    });
  }

  clearAll() {
    if (this.state.nodes.length === 0 && this.state.getCanvasRepos().length === 0) return;
    this.ui.showConfirm('Permanently delete all features?', () => {
      this.state.clearAll();
      clearInterval(this.state.simulationInterval);
      this.closePanel();
      this.closeDeepDive();
      this.render();
      this.renderer.renderEnvironmentCards(); // Clear environment cards
      this.ui.showToast('Canvas Cleared');
      // Restart simulation for any remaining features
      this.startSimulation();
    });
  }

  // User Action Handler
  handleUserAction(featureId, actionId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    // Log the action
    const phase = PHASES.find((p) => p.id === feature.phaseId);
    console.log(`✅ User action: ${actionId} for "${feature.title}" in ${phase.label}`);

    // If approved, move to next phase
    if (actionId === 'approve' || actionId === 'deploy') {
      const newPhase = feature.phaseId + 1;
      const updated = this.state.updateFeature(featureId, { phaseId: newPhase });
      if (updated) {
        const newPhaseInfo = PHASES.find((p) => p.id === newPhase);
        this.state.addActivityEvent(
          updated,
          'user_approval',
          `User approved - moved to ${newPhaseInfo.label}`
        );
        this.state.setGranularProgress(featureId, newPhase, 0);
        this.state.save();
        this.ui.showToast(`Approved! Moving to ${newPhaseInfo.label}`);
      }
    } else {
      // For other actions, just log and stay in current phase
      this.state.addActivityEvent(feature, 'user_action', `User selected: ${actionId}`);
      this.state.save();
      this.ui.showToast(`Action recorded: ${actionId}`);
    }

    // Close panel and continue simulation
    this.closePanel();
  }

  archiveFeature() {
    const feature = this.state.getFeature(this.state.selectedNodeId);
    if (feature) {
      const updated = this.state.updateFeature(feature.id, {
        'settings.archived': true,
        archivedAt: new Date().toISOString(),
      });
      if (updated) {
        this.state.addActivityEvent(updated, 'archived', 'Feature archived');
        this.state.save();
      }
    }
    this.ui.showToast('Feature Archived');
    this.closePanel();
  }

  // Rendering
  render() {
    // Render main canvas
    this.renderer.render(
      (nodeId) => this.openEdit(nodeId),
      (nodeId) => this.initCreate(nodeId),
      (featureId) => this.openDeepDive(featureId)
    );

    // Render modal if open
    if (this.state.isModalOpen) {
      this.renderer.renderModal((taskId) => this.openTaskDetail(taskId));
    }
  }

  // Deep Dive Modal
  openDeepDive(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    // Check if feature is in Implementation phase (phase 5)
    if (feature.phaseId === 5) {
      // Open phases view instead of tasks view
      if (this.state.openPhasesView(featureId)) {
        // Immediate render to switch canvas view
        this.render();

        // Force a second render after a brief delay
        setTimeout(() => {
          this.render();
        }, 50);
      }
    } else {
      // Open regular tasks view for other phases
      if (this.state.openDeepDive(featureId)) {
        // Immediate render to switch canvas view
        this.render();

        // Force a second render after a brief delay
        setTimeout(() => {
          this.render();
        }, 50);
      }
    }
  }

  closeDeepDive() {
    // Update state to return to features view
    if (this.state.viewMode === 'phases') {
      this.state.closePhasesView();
    } else {
      this.state.closeDeepDive();
    }

    // Re-render the canvas to show features
    this.render();

    // Close sidebar if open
    this.closePanel();
  }

  openTaskDetail(taskId) {
    const feature = this.state.getFeature(this.state.modalFeatureId);
    if (!feature) return;

    const task = feature.tasks.find((t) => t.id === taskId);
    if (!task) {
      this.ui.showToast('Task not found', true);
      return;
    }

    // Open modal sidepanel
    this.isModalPanelOpen = true;
    document.getElementById('modal-panel-title').textContent = 'TASK DETAILS';
    document.getElementById('modal-panel-id-display').textContent =
      `ID: #${task.id.substr(-4).toUpperCase()}`;

    // Populate task details
    const container = document.getElementById('modal-tab-container');

    // Build the HTML content with proper escaping
    let html = `
            <div class="space-y-4">
                <div>
                    <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Title</label>
                    <p class="text-sm font-semibold text-slate-700">${this.escapeHtml(task.title || 'Untitled Task')}</p>
                </div>
                <div>
                    <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Description</label>
                    <p class="text-xs text-slate-600 leading-relaxed">${this.escapeHtml(task.description || 'No description')}</p>
                </div>
                <div>
                    <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Status</label>
                    <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold uppercase ${
                      task.status === 'done'
                        ? 'bg-emerald-100 text-emerald-700'
                        : task.status === 'progress'
                          ? 'bg-blue-100 text-blue-700'
                          : task.status === 'blocked'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                    }">
                        ${task.status}
                    </span>
                </div>
                ${
                  task.status === 'blocked' && task.blockedReason
                    ? `
                    <div>
                        <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Blocked Reason</label>
                        <div class="flex items-start gap-2 px-3 py-2 rounded bg-red-50 border border-red-200">
                            <i class="fas fa-lock text-red-500 text-xs mt-0.5"></i>
                            <span class="text-xs text-red-700">${this.escapeHtml(task.blockedReason)}</span>
                        </div>
                    </div>
                `
                    : ''
                }
                ${
                  task.acceptanceCriteria && task.acceptanceCriteria.length > 0
                    ? `
                    <div>
                        <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">Acceptance Criteria</label>
                        <div class="space-y-1.5">
                            ${task.acceptanceCriteria
                              .map(
                                (ac) => `
                                <div class="flex items-start gap-2">
                                    <i class="fas ${ac.completed ? 'fa-check-circle text-emerald-500' : 'fa-circle text-slate-300'} text-xs mt-0.5"></i>
                                    <span class="text-xs ${ac.completed ? 'text-slate-700' : 'text-slate-500'}">${this.escapeHtml(ac.description)}</span>
                                </div>
                            `
                              )
                              .join('')}
                        </div>
                    </div>
                `
                    : ''
                }
                ${
                  task.status === 'done' && task.commits && task.commits.length > 0
                    ? `
                    <div class="border-t border-slate-200 pt-4">
                        <div class="flex items-center justify-between mb-3">
                            <label class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Commits</label>
                            ${
                              task.changesSummary
                                ? `
                                <div class="flex items-center gap-2 text-[9px]">
                                    <span class="text-slate-500">${task.changesSummary.filesChanged} files</span>
                                    <span class="text-emerald-600"><i class="fas fa-plus text-[8px]"></i> ${task.changesSummary.additions}</span>
                                    <span class="text-red-600"><i class="fas fa-minus text-[8px]"></i> ${task.changesSummary.deletions}</span>
                                </div>
                            `
                                : ''
                            }
                        </div>
                        <div class="space-y-2">
                            ${task.commits
                              .map(
                                (commit) => `
                                <div class="bg-slate-50 rounded p-3 border border-slate-200">
                                    <div class="flex items-start gap-2 mb-1.5">
                                        <i class="fas fa-code-commit text-emerald-600 text-xs mt-0.5"></i>
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2 mb-1">
                                                <code class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">${this.escapeHtml(commit.sha)}</code>
                                                <span class="text-[9px] text-slate-400">${this.escapeHtml(commit.timestamp)}</span>
                                            </div>
                                            <p class="text-xs text-slate-700 font-medium mb-1">${this.escapeHtml(commit.message)}</p>
                                            <div class="flex items-center gap-3 text-[9px] text-slate-500">
                                                <span><i class="fas fa-user text-[8px]"></i> ${this.escapeHtml(commit.author)}</span>
                                                <span><i class="fas fa-file text-[8px]"></i> ${commit.filesChanged} files</span>
                                                <span class="text-emerald-600"><i class="fas fa-plus text-[8px]"></i> ${commit.additions}</span>
                                                <span class="text-red-600"><i class="fas fa-minus text-[8px]"></i> ${commit.deletions}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `
                              )
                              .join('')}
                        </div>
                    </div>
                `
                    : ''
                }
            </div>
        `;

    container.innerHTML = html;

    document.getElementById('modal-side-panel').classList.remove('translate-x-full');
  }

  closeModalPanel() {
    this.isModalPanelOpen = false;
    document.getElementById('modal-side-panel').classList.add('translate-x-full');
  }

  // Escape key handling (onion layers)
  handleEscapeKey(e) {
    if (e.key !== 'Escape') return;

    // Layer 0: Close desktop environment modal (highest priority)
    const desktopModal = document.getElementById('desktop-modal');
    if (desktopModal && desktopModal.classList.contains('show')) {
      this.closeDesktopModal();
      return;
    }

    // Layer 1: Close task detail panel in modal
    if (this.isModalPanelOpen) {
      this.closeModalPanel();
      return;
    }

    // Layer 2: Close deep dive modal
    if (this.state.isModalOpen) {
      this.closeDeepDive();
      return;
    }

    // Layer 3: Close main feature panel
    const mainPanel = document.getElementById('side-panel');
    if (!mainPanel.classList.contains('translate-x-full')) {
      this.closePanel();
      return;
    }
  }

  // Prompt Simulation Methods
  submitPrdPrompt(nodeId) {
    const input = document.getElementById('prd-prompt-input');
    const prompt = input?.value?.trim();
    if (!prompt) return;

    // Simulate processing with callback to update first question
    this.simulateProcessing('prd-progress-bar', 'prd-prompt-input', 'prd-action-bar', () => {
      this.updatePrdFirstQuestion(nodeId, prompt);
    });
  }

  submitPlanPrompt(nodeId) {
    const input = document.getElementById('plan-prompt-input');
    const prompt = input?.value?.trim();
    if (!prompt) return;

    // Simulate processing with callback to update first decision
    this.simulateProcessing('plan-progress-bar', 'plan-prompt-input', 'plan-action-bar', () => {
      this.updatePlanFirstDecision(nodeId, prompt);
    });
  }

  simulateProcessing(progressBarId, inputId, actionBarId, onComplete) {
    const progressBar = document.getElementById(progressBarId);
    const progressFill = progressBar?.querySelector('.h-full');
    const input = document.getElementById(inputId);
    const actionBar = document.getElementById(actionBarId);

    if (!progressBar || !progressFill || !actionBar) return;

    // Disable all controls in action bar (buttons and question options)
    const buttons = actionBar.querySelectorAll('button');
    buttons.forEach((btn) => (btn.disabled = true));
    if (input) input.disabled = true;

    // Also disable question option buttons in the scrollable content area
    const container = document.getElementById('tab-container');
    const questionButtons = container?.querySelectorAll('button[data-question]');
    questionButtons?.forEach((btn) => (btn.disabled = true));

    // Show progress bar with opacity transition
    progressBar.style.opacity = '1';

    // Animate progress over 10 seconds
    const duration = 10000; // 10 seconds
    const steps = 100;
    const interval = duration / steps;
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      currentStep++;
      const percentage = currentStep;
      progressFill.style.width = `${percentage}%`;

      if (currentStep >= steps) {
        clearInterval(progressInterval);

        // Complete processing
        setTimeout(() => {
          // Hide progress bar with opacity transition
          progressBar.style.opacity = '0';

          setTimeout(() => {
            progressFill.style.width = '0%';
          }, 200);

          // Re-enable controls
          buttons.forEach((btn) => (btn.disabled = false));
          questionButtons?.forEach((btn) => (btn.disabled = false));
          if (input) {
            input.disabled = false;
            input.value = '';
          }

          // Call completion callback
          onComplete();
        }, 300);
      }
    }, interval);
  }

  updatePrdFirstQuestion(nodeId, userPrompt) {
    const feature = this.state.getFeature(nodeId);
    if (!feature) return;

    const actionDetails = this.state.getActionDetails(feature);
    if (actionDetails?.type !== 'questionnaire' || !actionDetails.questions?.length) return;

    // Update first question with new options based on prompt
    const firstQuestion = actionDetails.questions[0];
    const newOptions = [
      {
        id: 'user_suggestion',
        label: `User suggested: ${userPrompt.substring(0, 40)}${userPrompt.length > 40 ? '...' : ''}`,
        rationale: `Based on your input: "${userPrompt}"`,
        recommended: true,
        isNew: true, // Mark as new for animation
      },
      ...firstQuestion.options.map((opt) => ({ ...opt, recommended: false, isNew: false })),
    ];

    firstQuestion.options = newOptions;

    // Re-render the action tab to show updated question
    this.renderUserActionTab();
    this.ui.showToast('Requirements updated based on your input', false);

    // Scroll to first question to show the new option
    setTimeout(() => {
      const container = document.getElementById('tab-container');
      if (container) {
        container.scrollTop = 0;
      }
    }, 100);
  }

  updatePlanFirstDecision(nodeId, userPrompt) {
    const feature = this.state.getFeature(nodeId);
    if (!feature) return;

    const actionDetails = this.state.getActionDetails(feature);
    if (actionDetails?.type !== 'technical_review' || !actionDetails.decisions?.length) return;

    // Completely rethink first decision based on prompt
    const firstDecision = actionDetails.decisions[0];
    const originalSelected = firstDecision.selected;

    // Generate new decision based on prompt
    firstDecision.selected = `${originalSelected} (Revised)`;
    firstDecision.rationale = `Reconsidered based on your feedback: "${userPrompt}". ${firstDecision.rationale}`;

    // Add user concern to cons
    firstDecision.cons = [
      `User concern: ${userPrompt}`,
      ...firstDecision.cons.slice(0, 3), // Keep only 3 original cons
    ];

    // Add alternative addressing user concern
    firstDecision.alternatives = [
      {
        option: 'User-suggested approach',
        why_not: `Analyzing feasibility: "${userPrompt}". Requires further research to compare against current selection.`,
      },
      ...firstDecision.alternatives.slice(0, 1), // Keep only 1 original alternative
    ];

    // Re-render the action tab to show updated decision
    this.renderUserActionTab();
    this.ui.showToast('Technical decision updated based on your feedback', false);
  }

  // Document Viewer
  async openDocument(filename) {
    try {
      // Fetch document content from sample-feature directory
      const response = await fetch(`sample-feature/${filename}`);
      if (!response.ok) {
        this.ui.showToast(`Failed to load ${filename}`, true);
        return;
      }

      const content = await response.text();
      const container = document.getElementById('tab-container');

      // Parse markdown to HTML
      const htmlContent = marked.parse(content);

      // Render document viewer with back button
      container.innerHTML = `
                <div class="h-full flex flex-col">
                    <div class="p-3 border-b border-slate-200 flex items-center gap-3">
                        <button onclick="app.closeDocument()" class="text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-2 text-xs font-semibold">
                            <i class="fas fa-arrow-left text-[10px]"></i>
                            <span>Back to Review</span>
                        </button>
                        <div class="flex-1 flex items-center gap-2">
                            <i class="fas fa-file-alt text-blue-600 text-xs"></i>
                            <span class="text-xs font-bold text-slate-700">${filename}</span>
                        </div>
                        <button onclick="app.copyDocumentContent()" class="text-slate-400 hover:text-slate-600 transition-colors" title="Copy content">
                            <i class="fas fa-copy text-xs"></i>
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto p-4">
                        <div id="doc-content" class="prose prose-sm max-w-none text-[10px]"></div>
                    </div>
                </div>
            `;

      // Insert the parsed HTML
      document.getElementById('doc-content').innerHTML = htmlContent;

      // Store raw content for copying
      this.currentDocumentContent = content;

      // Hide action bar when viewing document
      const actionBar = document.getElementById('action-bar');
      if (actionBar) actionBar.style.display = 'none';
      const prdActionBar = document.getElementById('prd-action-bar');
      if (prdActionBar) prdActionBar.style.display = 'none';
      const planActionBar = document.getElementById('plan-action-bar');
      if (planActionBar) planActionBar.style.display = 'none';
    } catch (error) {
      console.error('Error loading document:', error);
      this.ui.showToast('Failed to load document', true);
    }
  }

  closeDocument() {
    // Re-render the action tab to return to review view
    this.renderUserActionTab();

    // Scroll to documents section (at bottom of content)
    setTimeout(() => {
      const container = document.getElementById('tab-container');
      if (container) {
        // Scroll to bottom where documents section is located
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }

  copyDocumentContent() {
    if (this.currentDocumentContent) {
      navigator.clipboard
        .writeText(this.currentDocumentContent)
        .then(() => {
          this.ui.showToast('Content copied to clipboard', false);
        })
        .catch(() => {
          this.ui.showToast('Failed to copy content', true);
        });
    }
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // Environment Management Methods
  startEnvironment(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    const env = this.state.getEnvironment(featureId);

    // Toggle behavior: if running, stop it; if idle/stopped, start it
    if (env.status === 'running') {
      this.stopEnvironment(featureId);
      return;
    }

    // Mark as starting
    this.state.startEnvironment(featureId);
    this.updateEnvironmentUI(featureId);

    // Simulate environment startup (2 seconds - faster)
    setTimeout(() => {
      // Generate random port
      const port = 3000 + Math.floor(Math.random() * 9000);
      const url = `http://localhost:${port}`;

      // Mark as running
      this.state.runningEnvironment(featureId, url, port);
      this.updateEnvironmentUI(featureId);

      this.ui.showToast(`Dev server running on port ${port}`, false);
    }, 2000);
  }

  stopEnvironment(featureId) {
    this.state.stopEnvironment(featureId);
    this.updateEnvironmentUI(featureId);
    this.ui.showToast('Environment stopped', false);
  }

  deleteEnvironment(featureId) {
    this.state.stopEnvironment(featureId);
    this.updateEnvironmentUI(featureId);
    this.renderer.renderEnvironmentCards();
    this.ui.showToast('Environment removed', false);
  }

  updateEnvironmentUI(featureId) {
    const env = this.state.getEnvironment(featureId);
    const drawer = document.querySelector(`.feature-drawer[data-feature-id="${featureId}"]`);
    if (!drawer) return;

    const runBtn = drawer.querySelector('.run-env-btn');
    if (!runBtn) return;

    // Find the environment indicator on the card
    const indicator = document.querySelector(`.env-indicator[data-feature-id="${featureId}"]`);

    // Update button state classes
    runBtn.classList.remove('starting', 'running');

    if (env.status === 'idle' || env.status === 'stopped') {
      runBtn.title = 'Start local development server';
      runBtn.innerHTML = '<i class="fas fa-rocket"></i><span>Start Dev Server</span>';
      runBtn.onclick = (e) => {
        e.stopPropagation();
        window.app.startEnvironment(featureId);
      };
      // Hide indicator when not running
      if (indicator) indicator.classList.remove('visible');
    } else if (env.status === 'starting') {
      runBtn.classList.add('starting');
      runBtn.title = 'Starting environment...';
      runBtn.innerHTML = '<i class="fas fa-spinner"></i><span>Starting...</span>';
      // Hide indicator while starting
      if (indicator) indicator.classList.remove('visible');
    } else if (env.status === 'running') {
      runBtn.classList.add('running');
      runBtn.title = `Click to open: ${env.url}`;
      runBtn.innerHTML = `<i class="fas fa-check"></i><span>${env.url}</span>`;
      runBtn.onclick = (e) => {
        e.stopPropagation();
        this.openDesktopModal(featureId, env.url);
      };
      // Show indicator when running
      if (indicator) indicator.classList.add('visible');
    }

    // Update environment cards on the right side
    this.renderer.renderEnvironmentCards();
  }

  // Repository Management Methods
  selectWelcomeRepo(repoId) {
    // Activate repo in DB (move from welcome to canvas) - pure data update
    this.state.activateRepo(repoId);
    this.render();
  }

  addNewRepository() {
    // On welcome page: open file browser modal
    const repos = this.state.getRepositories();
    const hasFeatures = this.state.features.length > 0;

    if (!hasFeatures && repos.length > 0) {
      // Welcome screen with repos: show file browser
      this.openFileBrowserModal();
    } else {
      // Not on welcome screen: add random repo directly to canvas
      const repo = this.state.addRandomRepository();
      if (repo) {
        repo.onCanvas = true;
        this.state.save();
        this.ui.showToast(`Added ${repo.fullName}`);
        this.render();
      }
    }
  }

  openFileBrowserModal() {
    const modal = document.getElementById('file-browser-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('opacity-100');
    setTimeout(() => {
      const window = document.getElementById('file-browser-window');
      if (window) window.classList.remove('scale-95');
    }, 10);

    // Initialize file browser with workspaces directory
    this.currentBrowsePath = '/Users/developer/workspaces';
    this.renderFileBrowserContents();
  }

  closeFileBrowserModal() {
    const modal = document.getElementById('file-browser-modal');
    const fbWindow = document.getElementById('file-browser-window');
    if (!modal) return;

    if (fbWindow) fbWindow.classList.add('scale-95');
    modal.classList.remove('opacity-100');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }

  renderFileBrowserContents() {
    const browserList = document.getElementById('file-browser-list');
    if (!browserList) return;

    // Mock file system structure with real repo names
    const mockFs = {
      '/Users/developer/workspaces': {
        type: 'dir',
        children: {
          'shep-ai-cli': {
            type: 'repo',
            fullName: 'shep-ai/shep',
            path: '/Users/developer/workspaces/shep-ai-cli',
          },
          'platform-api': {
            type: 'repo',
            fullName: 'acme-corp/platform-api',
            path: '/Users/developer/workspaces/platform-api',
          },
          'web-dashboard': {
            type: 'repo',
            fullName: 'acme-corp/web-dashboard',
            path: '/Users/developer/workspaces/web-dashboard',
          },
          'edge-runtime': {
            type: 'repo',
            fullName: 'vercel/edge-runtime',
            path: '/Users/developer/workspaces/edge-runtime',
          },
          'sync-service': {
            type: 'repo',
            fullName: 'linear/sync-service',
            path: '/Users/developer/workspaces/sync-service',
          },
          'payment-engine': {
            type: 'repo',
            fullName: 'stripe/payment-engine',
            path: '/Users/developer/workspaces/payment-engine',
          },
        },
      },
    };

    const currentPath = this.currentBrowsePath || '/Users/developer/workspaces';
    const fsNode = mockFs[currentPath];

    // Clear the list
    browserList.innerHTML = '';

    if (!fsNode || fsNode.type !== 'dir') {
      const empty = document.createElement('div');
      empty.className = 'text-slate-400 text-xs p-4 text-center';
      empty.textContent = 'Directory not found';
      browserList.appendChild(empty);
      return;
    }

    const items = fsNode.children || {};
    if (Object.keys(items).length === 0) {
      const empty = document.createElement('div');
      empty.className = 'text-slate-400 text-xs p-4 text-center';
      empty.textContent = 'No repositories found';
      browserList.appendChild(empty);
      return;
    }

    // Sort items: repos first
    Object.entries(items)
      .sort(([, a], [, b]) => (a.type === 'repo' ? 0 : 1) - (b.type === 'repo' ? 0 : 1))
      .forEach(([, item]) => {
        if (item.type === 'repo') {
          const itemEl = document.createElement('div');
          itemEl.className =
            'flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0 group transition-colors';

          const icon = document.createElement('i');
          icon.className = 'fab fa-github text-slate-400 text-xs flex-shrink-0 group-hover:text-blue-500';

          const content = document.createElement('div');
          content.className = 'flex-1 min-w-0';

          const fullName = document.createElement('div');
          fullName.className =
            'text-slate-700 font-semibold text-xs truncate group-hover:text-blue-600';
          fullName.textContent = item.fullName;

          const path = document.createElement('div');
          path.className = 'text-slate-400 text-[10px] truncate mt-0.5';
          path.textContent = item.path;

          content.appendChild(fullName);
          content.appendChild(path);
          itemEl.appendChild(icon);
          itemEl.appendChild(content);

          itemEl.onclick = () => {
            this.selectRepositoryFromBrowser(item.fullName, item.path);
          };

          browserList.appendChild(itemEl);
        }
      });
  }

  selectRepositoryFromBrowser(fullName, localPath) {
    const repo = this.state.addRepository(fullName);
    if (repo) {
      repo.onCanvas = true;
      if (localPath) repo.localPath = localPath;
    }

    this.closeFileBrowserModal();
    this.state.save();
    this.ui.showToast(`Added ${fullName}`);
    this.render();
  }

  createFeatureFromIdea(repoId, ideaTitle) {
    const feature = this.state.createFeature({
      title: ideaTitle,
      description: `Auto-generated from idea: ${ideaTitle}`,
      repositoryId: repoId,
      phaseId: 0,
      priority: 'medium',
    });

    if (feature) {
      this.ui.showToast(`Feature "${ideaTitle}" created`);
      this.render();
      // Start simulation for the new feature
      this.state.setGranularProgress(feature.id, 0, 0);
    }
  }

  createFeatureForRepo(repoId) {
    // Open create panel with repo pre-selected (no selection state stored)
    this.pendingRepoId = repoId;
    this.initCreate(null);
  }

  copyCliCommand() {
    const text = 'cd ~/my-repo\nshep feat new "create modern, sleek dashboards"';
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.ui.showToast('Command copied to clipboard', false);
      })
      .catch(() => {
        this.ui.showToast('Failed to copy command', true);
      });
  }

  copyURL(url) {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.ui.showToast('URL copied to clipboard', false);
      })
      .catch(() => {
        this.ui.showToast('Failed to copy URL', true);
      });
  }

  openInVSCode(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    this.ui.showToast(`Opening ${feature.title} in VSCode...`, false);
    // In real implementation: window.open(`vscode://file/${worktreePath}`)
  }

  openPR(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    this.ui.showToast(`Opening PR for ${feature.title}...`, false);
    // In real implementation: window.open(prUrl, '_blank')
  }

  openWebPreview(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    this.ui.showToast(`Opening web preview for ${feature.title}...`, false);
    // In real implementation: open preview in new tab
  }

  openTerminal(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    this.ui.showToast(`Opening terminal for ${feature.title}...`, false);
    // In real implementation: open terminal with worktree context
  }

  openIDEPreview(featureId) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    this.ui.showToast(`Opening IDE preview for ${feature.title}...`, false);
    // In real implementation: open IDE-style preview
  }

  // Desktop Environment Modal Methods
  openDesktopModal(featureId, url) {
    const feature = this.state.getFeature(featureId);
    if (!feature) return;

    // Update modal title
    const titleEl = document.getElementById('desktop-window-title');
    if (titleEl) {
      titleEl.textContent = `${feature.title} - Development Environment`;
    }

    // Update web URL
    const urlInput = document.getElementById('web-url');
    if (urlInput && url) {
      urlInput.value = url;
    }

    // Generate branch name from feature title
    const branchName = `feat/${feature.title.toLowerCase().replace(/\s+/g, '-').substring(0, 30)}`;
    const worktreePath = `.worktrees/${branchName}`;

    // Generate PR number (simulate)
    const prNumber = Math.floor(Math.random() * 500) + 100;

    // Generate git stats (simulate)
    const commitsAhead = Math.floor(Math.random() * 5) + 1;
    const commitsBehind = Math.floor(Math.random() * 3);
    const filesModified = Math.floor(Math.random() * 8) + 1;

    // Update info bar
    const branchEl = document.getElementById('desktop-branch');
    if (branchEl) branchEl.textContent = branchName;

    const worktreeEl = document.getElementById('desktop-worktree');
    if (worktreeEl) worktreeEl.textContent = worktreePath;

    const prEl = document.getElementById('desktop-pr');
    if (prEl) prEl.textContent = `PR #${prNumber}`;

    const commitsAheadEl = document.getElementById('desktop-commits-ahead');
    if (commitsAheadEl) commitsAheadEl.textContent = commitsAhead;

    const commitsBehindEl = document.getElementById('desktop-commits-behind');
    if (commitsBehindEl) commitsBehindEl.textContent = commitsBehind;

    const filesModifiedEl = document.getElementById('desktop-files-modified');
    if (filesModifiedEl) filesModifiedEl.textContent = filesModified;

    // Store current feature data for PR link
    this.currentDesktopFeature = {
      id: featureId,
      prNumber: prNumber,
      branch: branchName,
    };

    // Show modal with animation
    const modal = document.getElementById('desktop-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);

    // Default to web tab
    this.switchDesktopTab('web');
  }

  closeDesktopModal() {
    const modal = document.getElementById('desktop-modal');
    modal.classList.remove('show');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }

  openPRLink() {
    if (this.currentDesktopFeature && this.currentDesktopFeature.prNumber) {
      this.ui.showToast(`Opening PR #${this.currentDesktopFeature.prNumber}...`, false);
      // In real implementation: window.open(`https://github.com/org/repo/pull/${this.currentDesktopFeature.prNumber}`, '_blank');
    }
  }

  switchDesktopTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.desktop-tab').forEach((btn) => {
      btn.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`)?.classList.add('active');

    // Update panels
    document.querySelectorAll('.desktop-panel').forEach((panel) => {
      panel.classList.remove('active');
    });
    document.getElementById(`${tabName}-panel`)?.classList.add('active');
  }

  // UI Proxies (for inline event handlers)
  toggleSection(sectionId) {
    this.ui.toggleSection(sectionId);
  }
  showConfirm(msg, cb) {
    this.ui.showConfirm(msg, cb);
  }
  closeConfirm() {
    this.ui.closeConfirm();
  }
}

// Global app instance
window.app = new App();
window.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
