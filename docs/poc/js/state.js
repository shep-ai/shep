import { createFeature, validateFeature, calculateProgress } from './schema.js';
import {
  PHASES,
  MOCK_IMPLEMENTATION_PHASES,
  MOCK_REPOS,
  RANDOM_REPO_NAMES,
  FEATURE_IDEAS,
} from './constants.js';

/**
 * AppState - Feature Database with LocalStorage persistence
 * Pure CRUD operations on Feature objects following the schema
 */
export class AppState {
  constructor() {
    this.features = []; // Array of Feature objects (following schema.js)
    this.repositories = []; // Array of Repository objects
    this.selectedFeatureId = null;
    // No selectedRepoId - UI is a pure view layer, no selection state
    this.presetIndex = 0;
    this.randomRepoIndex = 0;
    this.isSimulating = true; // Always on
    this.simulationInterval = null;
    this.currentTab = 'overview';

    // View mode state - seamless canvas navigation
    this.viewMode = 'features'; // 'features' | 'tasks'
    this.focusedFeatureId = null; // Feature being drilled into

    // Granular progress tracking
    this.phaseProgress = {}; // featureId -> { phase, subProgress: 0-100 }

    // Environment tracking - { featureId: { status: 'idle'|'starting'|'running'|'stopped', url: null|string, port: null|number } }
    this.featureEnvironments = {};

    this.load();
  }

  /**
   * Load features from localStorage database
   */
  load() {
    const storedData = localStorage.getItem('featureFlowData');
    const storedRepos = localStorage.getItem('featureFlowRepos');
    const storedEnvironments = localStorage.getItem('featureEnvironments');
    const wasCleared = localStorage.getItem('featureFlowCleared') === 'true';
    // selectedRepoId removed - UI is pure view layer

    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        console.log('📂 Loading', parsed.length, 'features from localStorage...');

        // Validate each feature on load
        this.features = parsed.filter((f) => {
          const validation = validateFeature(f);
          if (!validation.valid) {
            console.error('❌ Invalid feature found, skipping:', f.id, f.title, validation.errors);
          }
          return validation.valid;
        });

        console.log('✅ Loaded', this.features.length, 'valid features');
      } catch (e) {
        console.error('❌ Failed to load features:', e);
        this.features = [];
      }
    } else {
      console.log('📂 No stored features found, starting fresh');
      this.features = [];
    }

    // Load repositories (but not if user intentionally cleared data)
    if (storedRepos && !wasCleared) {
      try {
        this.repositories = JSON.parse(storedRepos);
        console.log('✅ Loaded', this.repositories.length, 'repositories');
      } catch (e) {
        console.error('❌ Failed to load repositories:', e);
        this.repositories = [];
      }
    } else if (wasCleared) {
      this.repositories = [];
      console.log('🧹 Repos cleared by user, staying empty');
    }

    // Load environment state
    if (storedEnvironments) {
      try {
        this.featureEnvironments = JSON.parse(storedEnvironments);
        console.log(
          '✅ Loaded environment state for',
          Object.keys(this.featureEnvironments).length,
          'features'
        );
      } catch (e) {
        console.error('❌ Failed to load environment state:', e);
        this.featureEnvironments = {};
      }
    }

    // Initialize with demo data if empty AND not intentionally cleared
    if (this.features.length === 0 && !wasCleared) {
      // Only load demo data on very first run (when no cleared flag and nothing stored)
      if (!storedData && !storedRepos) {
        console.log('🎨 Initializing demo data...');
        this.initDemoData();
      } else {
        console.log('🧹 Data was cleared by user, staying empty');
      }
    } else if (wasCleared) {
      console.log('🧹 Data was cleared by user, staying empty');
    }

    // Clean up legacy selectedRepoId from localStorage
    localStorage.removeItem('selectedRepoId');
  }

  /**
   * Save features to localStorage database
   */
  save() {
    try {
      localStorage.setItem('featureFlowData', JSON.stringify(this.features));
      localStorage.setItem('featureFlowRepos', JSON.stringify(this.repositories));
      localStorage.setItem('featureEnvironments', JSON.stringify(this.featureEnvironments));
      // Clear the "cleared" flag once new data is saved, so repos persist on refresh
      if (this.features.length > 0 || this.repositories.length > 0) {
        localStorage.removeItem('featureFlowCleared');
      }
    } catch (e) {
      console.error('Failed to save features:', e);
    }
  }

  /**
   * Initialize with demo features (only on first run)
   */
  initDemoData() {
    // Initialize default repos
    this.repositories = [...MOCK_REPOS];

    // Create root feature with tasks showing different states
    this.createFeature({
      title: 'SSO Integration',
      description: 'Implement single sign-on authentication system.',
      repositoryId: 'repo_1',
      phaseId: 5,
      priority: 'high',
      tags: [
        { id: 'tag_1', label: 'Authentication', color: 'blue' },
        { id: 'tag_2', label: 'Security', color: 'red' },
      ],
      tasks: [
        {
          id: 'task_1',
          title: 'Design architecture',
          description: 'Define system architecture and component interactions',
          status: 'done',
          order: 0,
          acceptanceCriteria: [
            { id: 'ac_1', description: 'Architecture diagram created', completed: true },
            { id: 'ac_2', description: 'Tech stack approved', completed: true },
            { id: 'ac_3', description: 'Security review passed', completed: true },
          ],
          commits: [
            {
              sha: 'a3f7d9e',
              message: 'feat: add SSO architecture diagram and tech stack doc',
              author: 'Sarah Chen',
              timestamp: '2 days ago',
              filesChanged: 3,
              additions: 245,
              deletions: 12,
            },
            {
              sha: '8b2e1f4',
              message: 'docs: update security review checklist',
              author: 'Sarah Chen',
              timestamp: '2 days ago',
              filesChanged: 1,
              additions: 28,
              deletions: 5,
            },
          ],
          changesSummary: {
            filesChanged: 4,
            additions: 273,
            deletions: 17,
            commits: 2,
          },
          completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'task_2',
          title: 'Define data models',
          description: 'Create database schemas and data structures',
          status: 'done',
          order: 1,
          acceptanceCriteria: [
            { id: 'ac_3', description: 'User schema defined', completed: true },
            { id: 'ac_4', description: 'Session table created', completed: true },
            { id: 'ac_5', description: 'Migration scripts written', completed: true },
          ],
          commits: [
            {
              sha: 'c9d4a2b',
              message: 'feat(db): add user and session schemas',
              author: 'Mike Rodriguez',
              timestamp: '1 day ago',
              filesChanged: 5,
              additions: 187,
              deletions: 8,
            },
            {
              sha: 'f1e8c7a',
              message: 'feat(db): add database migration scripts',
              author: 'Mike Rodriguez',
              timestamp: '1 day ago',
              filesChanged: 3,
              additions: 156,
              deletions: 0,
            },
            {
              sha: '5d3b9f2',
              message: 'fix(db): correct foreign key constraints',
              author: 'Mike Rodriguez',
              timestamp: '22 hours ago',
              filesChanged: 2,
              additions: 12,
              deletions: 8,
            },
          ],
          changesSummary: {
            filesChanged: 10,
            additions: 355,
            deletions: 16,
            commits: 3,
          },
          completedAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'task_3',
          title: 'Implement core logic',
          description: 'Build main functionality and business logic',
          status: 'progress',
          order: 2,
          acceptanceCriteria: [
            { id: 'ac_6', description: 'OAuth flow implemented', completed: true },
            { id: 'ac_7', description: 'Token validation working', completed: true },
            { id: 'ac_8', description: 'Session management complete', completed: false },
            { id: 'ac_9', description: 'Error handling added', completed: false },
          ],
          commits: [
            {
              sha: 'e7a9b1c',
              message: 'feat(auth): implement OAuth 2.0 flow',
              author: 'Alex Kim',
              timestamp: '5 hours ago',
              filesChanged: 8,
              additions: 423,
              deletions: 34,
            },
            {
              sha: '2f6d8e3',
              message: 'feat(auth): add JWT token validation',
              author: 'Alex Kim',
              timestamp: '3 hours ago',
              filesChanged: 4,
              additions: 198,
              deletions: 12,
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'task_4',
          title: 'Add unit tests',
          description: 'Write comprehensive test coverage',
          status: 'todo',
          order: 3,
          acceptanceCriteria: [
            { id: 'ac_10', description: 'Auth flow tests written', completed: false },
            { id: 'ac_11', description: 'Token validation tests complete', completed: false },
            { id: 'ac_12', description: 'Edge cases covered', completed: false },
            { id: 'ac_13', description: '80% code coverage achieved', completed: false },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'task_5',
          title: 'Integration testing',
          description: 'Test integration with existing systems',
          status: 'blocked',
          order: 4,
          blockedReason: 'Waiting for staging environment deployment',
          acceptanceCriteria: [
            { id: 'ac_14', description: 'End-to-end tests passing', completed: false },
            { id: 'ac_15', description: 'Performance benchmarks met', completed: false },
            { id: 'ac_16', description: 'Security scan passed', completed: false },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    this.save();
  }

  /**
   * CREATE - Add new feature (following schema)
   * @param {Object} options - Feature options (title required)
   * @returns {Feature|null} Created feature or null if invalid
   */
  createFeature(options = {}) {
    if (!options.title) {
      console.error('Feature title is required');
      return null;
    }

    // Use schema factory to create proper Feature object
    const feature = createFeature(options.title, {
      ...options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Validate before saving
    const validation = validateFeature(feature);
    if (!validation.valid) {
      console.error('Invalid feature:', validation.errors);
      return null;
    }

    // Add activity event
    this.addActivityEvent(feature, 'created', 'Created feature');

    this.features.push(feature);
    this.save();

    console.log('✅ Feature created:', feature.id, feature.title);
    console.log('📊 Total features:', this.features.length);

    return feature;
  }

  /**
   * READ - Get feature by ID
   * @param {string} id - Feature ID
   * @returns {Feature|undefined} Feature or undefined if not found
   */
  getFeature(id) {
    const feature = this.features.find((f) => f.id === id);
    if (!feature) {
      console.error('❌ Feature not found:', id);
    }
    return feature;
  }

  /**
   * READ - Get all features
   * @returns {Feature[]} All features
   */
  getAllFeatures() {
    return [...this.features];
  }

  /**
   * UPDATE - Update feature (partial or full)
   * @param {string} id - Feature ID
   * @param {Object} updates - Fields to update
   * @returns {Feature|null} Updated feature or null if failed
   */
  updateFeature(id, updates) {
    const index = this.features.findIndex((f) => f.id === id);
    if (index === -1) {
      console.error('Feature not found:', id);
      return null;
    }

    // Deep merge for nested properties
    const updated = { ...this.features[index] };

    Object.keys(updates).forEach((key) => {
      if (key.includes('.')) {
        // Handle dot notation (e.g., 'settings.archived')
        const parts = key.split('.');
        let obj = updated;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!obj[parts[i]]) obj[parts[i]] = {};
          obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = updates[key];
      } else if (
        typeof updates[key] === 'object' &&
        updates[key] !== null &&
        !Array.isArray(updates[key])
      ) {
        // Deep merge for object properties
        updated[key] = { ...updated[key], ...updates[key] };
      } else {
        // Direct assignment for primitives and arrays
        updated[key] = updates[key];
      }
    });

    updated.updatedAt = new Date().toISOString();

    // Recalculate progress if tasks changed
    if (updates.tasks) {
      updated.progress = calculateProgress(updated.tasks);
    }

    // Validate updated feature
    const validation = validateFeature(updated);
    if (!validation.valid) {
      console.error('Invalid feature update:', validation.errors);
      return null;
    }

    this.features[index] = updated;
    this.save();

    return updated;
  }

  /**
   * DELETE - Remove feature and all children
   * @param {string} id - Feature ID
   * @returns {boolean} Success status
   */
  deleteFeature(id) {
    // Collect all IDs to delete (feature + descendants)
    const toDelete = [id];
    let i = 0;
    while (i < toDelete.length) {
      const currentId = toDelete[i];
      const children = this.features.filter((f) => f.parentId === currentId);
      children.forEach((c) => toDelete.push(c.id));
      i++;
    }

    // Remove all collected features
    this.features = this.features.filter((f) => !toDelete.includes(f.id));
    this.save();

    return true;
  }

  /**
   * Get feature hierarchy (tree structure)
   * @returns {Feature[]} Root features with children populated
   */
  getHierarchy() {
    const map = {};
    const roots = [];

    // First pass: create map and reset children
    this.features.forEach((f) => {
      f.children = [];
      map[f.id] = f;
    });

    // Second pass: build tree
    this.features.forEach((f) => {
      if (f.parentId && map[f.parentId]) {
        map[f.parentId].children.push(f);
      } else {
        roots.push(f);
      }
    });

    return roots;
  }

  /**
   * Add activity event to feature
   * @param {Feature} feature - Feature object
   * @param {string} type - Event type
   * @param {string} message - Event message
   * @param {Object} metadata - Additional data
   */
  addActivityEvent(feature, type, message, metadata = {}) {
    const event = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: feature.owner.id,
      userName: feature.owner.name,
      userInitials: feature.owner.initials,
      userAvatarColor: feature.owner.avatarColor,
      type,
      message,
      metadata,
      timestamp: new Date().toISOString(),
      timeAgo: 'just now',
    };

    feature.activity = feature.activity || [];
    feature.activity.unshift(event); // Add to beginning

    return event;
  }

  // ===== Repository Management =====

  /**
   * Get all repositories
   * @returns {Array} All repositories
   */
  getRepositories() {
    return [...this.repositories];
  }

  /**
   * Get repository by ID
   * @param {string} id - Repository ID
   * @returns {Object|undefined} Repository or undefined
   */
  getRepository(id) {
    return this.repositories.find((r) => r.id === id);
  }

  /**
   * Add a new repository
   * @param {string} fullName - "org/name" format
   * @returns {Object} Created repository
   */
  addRepository(fullName) {
    const parts = fullName.split('/');
    const repoName = parts[1] || fullName;
    const repo = {
      id: `repo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      org: parts[0] || 'unknown',
      name: repoName,
      fullName,
      localPath: `/Users/developer/projects/${repoName}`,
    };
    this.repositories.push(repo);
    this.save();
    return repo;
  }

  /**
   * Activate a repo (move from welcome to canvas)
   * @param {string} repoId - Repository ID
   * @returns {Object|null} Updated repository or null
   */
  activateRepo(repoId) {
    const repo = this.repositories.find((r) => r.id === repoId);
    if (repo) {
      repo.onCanvas = true;
      this.save();
    }
    return repo;
  }

  /**
   * Get repos that are on the canvas
   * @returns {Object[]} Repos with onCanvas === true
   */
  getCanvasRepos() {
    return this.repositories.filter((r) => r.onCanvas === true);
  }

  /**
   * Get repos that are NOT on the canvas (for welcome view)
   * @returns {Object[]} Repos with onCanvas !== true
   */
  getWelcomeRepos() {
    return this.repositories.filter((r) => r.onCanvas !== true);
  }

  /**
   * Add a random repository from the pool
   * @returns {Object} Created repository
   */
  addRandomRepository() {
    // Pick a random name that's not already added
    const existing = new Set(this.repositories.map((r) => r.fullName));
    const available = RANDOM_REPO_NAMES.filter((n) => !existing.has(n));
    if (available.length === 0) return null;

    const name = available[Math.floor(Math.random() * available.length)];
    return this.addRepository(name);
  }

  /**
   * Get features grouped by repository
   * @returns {Map<string, Feature[]>} Map of repoId -> features
   */
  getFeaturesByRepo() {
    const map = new Map();
    this.repositories.forEach((repo) => {
      map.set(repo.id, []);
    });

    this.features.forEach((f) => {
      if (f.repositoryId && map.has(f.repositoryId)) {
        map.get(f.repositoryId).push(f);
      }
    });

    return map;
  }

  /**
   * Get random feature ideas for a repository
   * @param {number} count - Number of ideas
   * @returns {string[]} Array of feature idea strings
   */
  getFeatureIdeas(count = 4) {
    const shuffled = [...FEATURE_IDEAS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Clear all features (for demo reset)
   */
  clearAll() {
    this.features = [];
    this.repositories = [];
    this.featureEnvironments = {}; // Clear environment state too
    this.selectedFeatureId = null;
    this.viewMode = 'features';
    this.focusedFeatureId = null;
    localStorage.setItem('featureFlowCleared', 'true');
    this.save();
  }

  /**
   * Open deep dive view for a feature's tasks (seamless canvas transition)
   * @param {string} featureId - Feature to drill down into
   */
  openDeepDive(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature) {
      console.error('Cannot open deep dive: feature not found', featureId);
      return false;
    }
    this.viewMode = 'tasks';
    this.focusedFeatureId = featureId;
    console.log('🔍 Drilling into tasks for:', feature.title);
    return true;
  }

  /**
   * Close deep dive view (return to features)
   */
  closeDeepDive() {
    this.viewMode = 'features';
    this.focusedFeatureId = null;
    console.log('⬅️ Returning to features view');
  }

  /**
   * Open phases view (for Implementation phase features)
   * @param {string} featureId - Feature ID
   * @returns {boolean} Success
   */
  openPhasesView(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature) return false;

    // Generate phases if not already created
    if (feature.phases.length === 0) {
      this.generatePhasesForFeature(featureId);
    }

    this.viewMode = 'phases';
    this.focusedFeatureId = featureId;
    console.log('🔍 Drilling into implementation phases for:', feature.title);
    return true;
  }

  /**
   * Close phases view (return to features)
   */
  closePhasesView() {
    this.viewMode = 'features';
    this.focusedFeatureId = null;
    console.log('⬅️ Returning to features view');
  }

  /**
   * Generate implementation phases for a feature
   * @param {string} featureId - Feature ID
   */
  generatePhasesForFeature(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature || feature.phaseId !== 5) return;

    // Deep clone the mock phases with unique IDs
    const phases = MOCK_IMPLEMENTATION_PHASES.map((phase) => ({
      ...phase,
      id: `${phase.id}_${featureId}`,
      actionItems: phase.actionItems.map((ai) => ({ ...ai })),
      commits: [],
      changesSummary: { filesChanged: 0, additions: 0, deletions: 0, commits: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Update feature
    this.updateFeature(featureId, {
      phases,
      featureBranch:
        feature.featureBranch || `feat/${feature.title.toLowerCase().replace(/\s+/g, '-')}`,
      implementationStartedAt: new Date().toISOString(),
    });

    console.log('📋 Generated', phases.length, 'implementation phases');
  }

  /**
   * Get phases for canvas rendering in phases view
   * @returns {Array} Phases from focused feature
   */
  getCanvasPhases() {
    if (this.viewMode !== 'phases' || !this.focusedFeatureId) return [];
    const feature = this.getFeature(this.focusedFeatureId);
    return feature ? feature.phases || [] : [];
  }

  /**
   * Get tasks for canvas rendering in task view
   * @returns {Array} Tasks from focused feature
   */
  getCanvasTasks() {
    if (!this.focusedFeatureId) return [];
    const feature = this.getFeature(this.focusedFeatureId);
    return feature ? feature.tasks || [] : [];
  }

  // Backward compatibility
  get isModalOpen() {
    return this.viewMode === 'tasks';
  }
  get modalFeatureId() {
    return this.focusedFeatureId;
  }
  getModalTasks() {
    return this.getCanvasTasks();
  }

  /**
   * Get granular progress for a feature (includes sub-progress within phase)
   * @param {string} featureId - Feature ID
   * @returns {Object} { phase, subProgress, totalProgress }
   */
  getGranularProgress(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature) return { phase: 0, subProgress: 0, totalProgress: 0 };

    const progress = this.phaseProgress[featureId] || { phase: feature.phaseId, subProgress: 0 };
    const totalPhases = 9; // 0-8
    const baseProgress = (progress.phase / totalPhases) * 100;
    const phaseProgress = (progress.subProgress / 100) * (100 / totalPhases);
    const totalProgress = Math.min(100, baseProgress + phaseProgress);

    return {
      phase: progress.phase,
      subProgress: progress.subProgress,
      totalProgress,
    };
  }

  /**
   * Update granular progress for a feature
   * @param {string} featureId - Feature ID
   * @param {number} phase - Current phase
   * @param {number} subProgress - Progress within phase (0-100)
   */
  setGranularProgress(featureId, phase, subProgress) {
    this.phaseProgress[featureId] = { phase, subProgress };
  }

  /**
   * Check if feature is waiting for user action
   * @param {string} featureId - Feature ID
   * @returns {boolean}
   */
  isWaitingForUserAction(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature) return false;

    const phase = PHASES.find((p) => p.id === feature.phaseId);
    return phase && phase.actionRequired;
  }

  /**
   * Generate tasks for a feature during simulation
   * @param {string} featureId - Feature ID
   */
  generateTasksForFeature(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature || feature.tasks?.length > 0) return; // Skip if tasks already exist

    // Generate 3-5 realistic tasks based on feature description
    const taskTemplates = [
      {
        title: 'Design architecture',
        description: 'Define system architecture and component interactions',
        status: 'todo',
      },
      {
        title: 'Define data models',
        description: 'Create database schemas and data structures',
        status: 'todo',
      },
      {
        title: 'Implement core logic',
        description: 'Build main functionality and business logic',
        status: 'todo',
      },
      { title: 'Add unit tests', description: 'Write comprehensive test coverage', status: 'todo' },
      {
        title: 'Integration testing',
        description: 'Test integration with existing systems',
        status: 'todo',
      },
    ];

    const numTasks = 3 + Math.floor(Math.random() * 3); // 3-5 tasks
    const tasks = [];

    for (let i = 0; i < numTasks; i++) {
      const template = taskTemplates[i % taskTemplates.length];
      tasks.push({
        id: `task_${Date.now()}_${i}`,
        title: template.title,
        description: template.description,
        status: i === 0 ? 'progress' : 'todo',
        order: i,
        acceptanceCriteria: [
          { id: `ac_${i}_1`, description: 'Implementation complete', completed: false },
          { id: `ac_${i}_2`, description: 'Code reviewed', completed: false },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    this.updateFeature(featureId, { tasks });
    console.log(`🎯 Generated ${tasks.length} tasks for "${feature.title}"`);
  }

  /**
   * Get user action details for a feature in action-required phase
   * @param {string} featureId - Feature ID
   * @returns {Object} { question, options, context, type }
   */
  getUserActionDetails(featureId) {
    const feature = this.getFeature(featureId);
    if (!feature) return null;

    const phase = PHASES.find((p) => p.id === feature.phaseId);
    if (!phase || !phase.actionRequired) return null;

    // Generate contextual question based on phase
    const actionDetails = {
      'Review PRD': {
        type: 'questionnaire',
        question: 'Requirements Discovery & Validation',
        context: `As Product Manager for "${feature.title}", I need to gather comprehensive requirements before proceeding to technical planning.`,
        questions: [
          {
            id: 'problem',
            question: 'What specific problem does this feature solve?',
            type: 'select',
            options: [
              {
                id: 'user_pain',
                label: 'User pain point/friction',
                rationale: 'Direct user feedback indicates current workflow is inefficient',
                recommended: true,
              },
              {
                id: 'business_req',
                label: 'Business requirement/opportunity',
                rationale: 'Market analysis shows demand for this capability',
              },
              {
                id: 'technical_debt',
                label: 'Technical debt/limitation',
                rationale: 'Current system cannot scale to meet growth projections',
              },
              {
                id: 'competitive',
                label: 'Competitive gap',
                rationale: 'Feature parity with market leaders',
              },
            ],
          },
          {
            id: 'priority',
            question: 'What is the business priority level?',
            type: 'select',
            options: [
              {
                id: 'p0',
                label: 'P0 - Critical (Revenue/Security)',
                rationale: 'Blocking revenue or security vulnerability',
              },
              {
                id: 'p1',
                label: 'P1 - High (Core feature)',
                rationale: 'Essential for product-market fit',
                recommended: true,
              },
              {
                id: 'p2',
                label: 'P2 - Medium (Enhancement)',
                rationale: 'Improves UX but not blocking',
              },
              { id: 'p3', label: 'P3 - Low (Nice-to-have)', rationale: 'Future consideration' },
            ],
          },
          {
            id: 'success',
            question: 'What metrics define success?',
            type: 'select',
            options: [
              {
                id: 'adoption',
                label: 'User adoption rate',
                rationale: '>60% of active users engage within 30 days',
                recommended: true,
              },
              {
                id: 'performance',
                label: 'Performance improvement',
                rationale: '50% reduction in task completion time',
              },
              {
                id: 'revenue',
                label: 'Revenue impact',
                rationale: '15% increase in conversion rate',
              },
              {
                id: 'satisfaction',
                label: 'User satisfaction (NPS)',
                rationale: 'NPS score improvement of +10 points',
              },
            ],
          },
          {
            id: 'timeline',
            question: 'What is the target timeline?',
            type: 'select',
            options: [
              {
                id: 'urgent',
                label: 'Urgent (<2 weeks)',
                rationale: 'Critical blocker requiring immediate attention',
              },
              {
                id: 'sprint',
                label: 'Current sprint (2-4 weeks)',
                rationale: 'Planned for this iteration',
                recommended: true,
              },
              {
                id: 'quarter',
                label: 'This quarter (3 months)',
                rationale: 'Strategic roadmap item',
              },
              {
                id: 'backlog',
                label: 'Future backlog (6+ months)',
                rationale: 'Long-term consideration',
              },
            ],
          },
          {
            id: 'scope',
            question: 'What is the feature scope?',
            type: 'select',
            options: [
              {
                id: 'mvp',
                label: 'MVP (Minimum Viable)',
                rationale: 'Core functionality only, iterate later',
                recommended: true,
              },
              {
                id: 'standard',
                label: 'Standard release',
                rationale: 'Full feature set with edge cases covered',
              },
              {
                id: 'comprehensive',
                label: 'Comprehensive solution',
                rationale: 'Complete with advanced features and integrations',
              },
              {
                id: 'enterprise',
                label: 'Enterprise-grade',
                rationale: 'Production-ready with SLA guarantees',
              },
            ],
          },
          {
            id: 'stakeholders',
            question: 'Who are the primary stakeholders?',
            type: 'select',
            options: [
              {
                id: 'end_users',
                label: 'End users/customers',
                rationale: 'Direct impact on customer experience',
                recommended: true,
              },
              {
                id: 'internal',
                label: 'Internal teams',
                rationale: 'Improves internal tools and workflows',
              },
              {
                id: 'partners',
                label: 'Partners/integrations',
                rationale: 'Enables partner ecosystem',
              },
              {
                id: 'executives',
                label: 'Executive leadership',
                rationale: 'Strategic business initiative',
              },
            ],
          },
        ],
        finalAction: {
          id: 'approve',
          label: 'Finalize Requirements',
          description: 'Move to technical planning phase',
        },
      },
      'Review Plan': {
        type: 'technical_review',
        question: 'Technical Implementation Plan Review',
        context: `Review the technical decisions and architecture choices made during planning for "${feature.title}". AI has analyzed requirements and selected optimal approaches.`,
        overview: {
          summary:
            'AI has designed a scalable microservices architecture with proven technologies and comprehensive testing coverage.',
          highlights: [
            'Microservices pattern for independent scaling and team autonomy',
            'PostgreSQL + Redis for ACID compliance with fast caching',
            'REST API following company standards with HTTP caching',
            'Unit + Integration testing (80/20) balancing quality and velocity',
            'Full documentation suite generated (spec, research, plan, tasks, data model)',
          ],
        },
        decisions: [
          {
            aspect: 'Architecture Pattern',
            selected: 'Microservices',
            rationale:
              'Enables independent scaling and deployment of features. Our team already has Kubernetes infrastructure and CI/CD pipelines in place for microservices.',
            pros: [
              'Independent scaling per service',
              'Team autonomy and parallel development',
              'Technology flexibility per service',
              'Fault isolation and resilience',
            ],
            cons: [
              'Increased operational complexity',
              'Network latency between services',
              'Distributed debugging challenges',
              'Data consistency complexity',
            ],
            alternatives: [
              {
                option: 'Monolithic',
                why_not:
                  'Harder to scale individual features independently, single deployment unit creates bottlenecks',
              },
              {
                option: 'Serverless',
                why_not:
                  'Cold start latency unacceptable for user-facing features, limited runtime control',
              },
            ],
          },
          {
            aspect: 'Data Storage Strategy',
            selected: 'PostgreSQL + Redis',
            rationale:
              'PostgreSQL provides ACID guarantees for critical data while Redis handles high-frequency reads and session state. Proven stack with strong team expertise.',
            pros: [
              'ACID compliance for critical transactions',
              'Fast caching layer reduces DB load',
              'Rich query capabilities (JSON, full-text)',
              'Strong ecosystem and tooling',
            ],
            cons: [
              'Two systems to manage and monitor',
              'Cache invalidation complexity',
              'Higher infrastructure cost',
              'Potential cache-DB consistency issues',
            ],
            alternatives: [
              {
                option: 'MongoDB',
                why_not:
                  'Flexible schema tempting but leads to data quality issues, lacks strong ACID for critical features',
              },
              {
                option: 'Redis Only',
                why_not:
                  'Ultra-fast but persistence model risky for critical data, limited query capabilities',
              },
            ],
          },
          {
            aspect: 'API Design',
            selected: 'REST',
            rationale:
              'Consistent with existing company standards, excellent HTTP caching support, and well-understood by all teams. Simple client integration.',
            pros: [
              'Industry standard with universal tooling',
              'HTTP caching built-in (304, ETags)',
              'Simple client integration',
              'Clear resource-based semantics',
            ],
            cons: [
              'Over-fetching or under-fetching data',
              'Multiple round trips for related data',
              'Versioning challenges',
              'No built-in real-time subscriptions',
            ],
            alternatives: [
              {
                option: 'GraphQL',
                why_not:
                  'Flexible queries but adds client complexity, caching harder, learning curve for team',
              },
              {
                option: 'gRPC',
                why_not:
                  'High performance but browser support limited, debugging harder, not RESTful',
              },
            ],
          },
          {
            aspect: 'Testing Strategy',
            selected: 'Unit + Integration (80/20)',
            rationale:
              'Balances quality assurance with development velocity. 80% unit test coverage for business logic, critical integration paths fully covered.',
            pros: [
              'Fast feedback loop for developers',
              'Catches regressions early',
              'Critical paths fully validated',
              'Reasonable CI/CD pipeline duration',
            ],
            cons: [
              'Not full E2E coverage',
              'Some UI flows only manually tested',
              'Integration environment maintenance',
              'Mocks may diverge from reality',
            ],
            alternatives: [
              {
                option: 'Unit Only',
                why_not:
                  'Fast feedback but misses integration issues, discovered too late in staging',
              },
              {
                option: 'Full E2E',
                why_not:
                  'Maximum confidence but slow CI pipeline (20+ min), flaky tests, high maintenance',
              },
            ],
          },
        ],
        documents: [
          {
            name: 'spec.md',
            description: 'Feature specification and requirements',
            type: 'Specification',
            icon: 'fa-file-alt',
            color: 'blue',
          },
          {
            name: 'research.md',
            description: 'Technical research and library evaluations',
            type: 'Research',
            icon: 'fa-flask',
            color: 'purple',
          },
          {
            name: 'plan.md',
            description: 'Implementation strategy and approach',
            type: 'Implementation Plan',
            icon: 'fa-map',
            color: 'indigo',
          },
          {
            name: 'tasks.md',
            description: 'Detailed task breakdown with acceptance criteria',
            type: 'Task Breakdown',
            icon: 'fa-list-check',
            color: 'sky',
          },
          {
            name: 'data-model.md',
            description: 'Database schema and entity relationships',
            type: 'Data Model',
            icon: 'fa-database',
            color: 'emerald',
          },
        ],
        options: [
          {
            id: 'approve',
            label: 'Approve & Continue to Implementation',
            color: 'emerald',
            icon: 'fa-check',
          },
          { id: 'revise', label: 'Request Changes to Plan', color: 'amber', icon: 'fa-edit' },
          { id: 'reject', label: 'Reject & Go Back to Planning', color: 'red', icon: 'fa-times' },
        ],
      },
      'QA Check': {
        type: 'qa_review',
        question: 'Quality Assurance Review',
        context: `"${feature.title}" implementation complete. QA checklist review required.`,
        checklist: [
          {
            item: 'Functional requirements met',
            status: 'pass',
            details: 'All acceptance criteria validated',
          },
          {
            item: 'Performance benchmarks',
            status: 'pass',
            details: 'API response time <200ms (p95)',
          },
          {
            item: 'Security scan',
            status: 'pass',
            details: 'No vulnerabilities found (OWASP Top 10)',
          },
          {
            item: 'Browser compatibility',
            status: 'pass',
            details: 'Tested on Chrome, Firefox, Safari',
          },
          {
            item: 'Mobile responsiveness',
            status: 'warning',
            details: 'Minor layout issue on iPhone SE (non-blocking)',
          },
          { item: 'Accessibility (WCAG 2.1)', status: 'pass', details: 'AA compliance verified' },
        ],
        options: [
          {
            id: 'approve',
            label: 'Pass QA',
            description: 'Quality standards met, ready for production',
            color: 'emerald',
          },
          {
            id: 'conditional',
            label: 'Approve with Notes',
            description: 'Minor issues documented for future fix',
            color: 'amber',
          },
          {
            id: 'fail',
            label: 'Reject',
            description: 'Blocking issues found, needs rework',
            color: 'red',
          },
        ],
      },
      'Final Approval': {
        type: 'deployment',
        question: 'Production Deployment Approval',
        context: `"${feature.title}" ready for deployment. Final sign-off required.`,
        readiness: [
          { check: 'Code review approved', status: true },
          { check: 'Tests passing (186/186)', status: true },
          { check: 'QA approved', status: true },
          { check: 'Documentation updated', status: true },
          { check: 'Rollback plan prepared', status: true },
          { check: 'Monitoring alerts configured', status: true },
        ],
        options: [
          {
            id: 'deploy',
            label: 'Deploy to Production',
            description: 'Ship it! 🚀',
            color: 'emerald',
          },
          {
            id: 'staging',
            label: 'Staging First',
            description: 'Final validation in staging environment',
            color: 'blue',
          },
          {
            id: 'hold',
            label: 'Hold',
            description: 'Wait for better deployment window',
            color: 'slate',
          },
        ],
      },
    };

    return actionDetails[phase.label] || null;
  }

  /**
   * Progress a phase during simulation
   * @param {string} featureId - Feature ID
   * @param {string} phaseId - Phase ID
   */
  progressPhase(featureId, phaseId) {
    const feature = this.getFeature(featureId);
    if (!feature) return;

    const phase = feature.phases?.find((p) => p.id === phaseId);
    if (!phase || phase.status !== 'running') return;

    // Increment progress by 10%
    const newProgress = Math.min(100, phase.progress + 10);
    const itemsToComplete = Math.floor((newProgress / 100) * phase.actionItems.length);

    // Complete action items proportionally
    phase.actionItems.forEach((item, idx) => {
      if (idx < itemsToComplete) item.completed = true;
    });

    // Generate commits at milestones (25%, 50%, 75%, 100%)
    const milestones = [25, 50, 75, 100];
    const lastMilestone = milestones.find((m) => phase.progress < m && newProgress >= m);

    if (lastMilestone) {
      const tddPhase = this.inferTDDPhase(phase, newProgress);
      const commit = this.generatePhaseCommit(phase, tddPhase, lastMilestone);
      phase.commits.push(commit);

      // Update changes summary
      phase.changesSummary.commits++;
      phase.changesSummary.additions += commit.additions;
      phase.changesSummary.deletions += commit.deletions;
      phase.changesSummary.filesChanged += commit.filesChanged;
    }

    // Update progress and timestamp
    phase.progress = newProgress;
    phase.updatedAt = new Date().toISOString();

    // Complete phase at 100%
    if (newProgress >= 100) {
      phase.status = 'completed';
      phase.completedAt = new Date().toISOString();

      // Auto-merge after short delay
      setTimeout(() => {
        this.mergePhase(featureId, phaseId);
      }, 1500);
    }

    this.save();
  }

  /**
   * Update a phase
   * @param {string} featureId - Feature ID
   * @param {string} phaseId - Phase ID
   * @param {Object} updates - Fields to update
   */
  updatePhase(featureId, phaseId, updates) {
    const feature = this.getFeature(featureId);
    if (!feature) return;

    const phase = feature.phases?.find((p) => p.id === phaseId);
    if (!phase) return;

    Object.assign(phase, updates);
    phase.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Merge a completed phase into feature branch
   * @param {string} featureId - Feature ID
   * @param {string} phaseId - Phase ID
   */
  mergePhase(featureId, phaseId) {
    const feature = this.getFeature(featureId);
    if (!feature) return;

    const phase = feature.phases?.find((p) => p.id === phaseId);
    if (!phase) return;

    phase.status = 'merged';
    phase.mergedAt = new Date().toISOString();
    phase.mergedInto = feature.featureBranch;
    phase.updatedAt = new Date().toISOString();

    this.save();

    // Check if all phases are merged
    const allMerged = feature.phases.every((p) => p.status === 'merged');
    if (allMerged) {
      // Move feature to next phase (QA Check, phase 6)
      this.updateFeature(featureId, { phaseId: 6 });
      console.log('✅ All phases merged! Feature moving to QA Check phase');
    }
  }

  /**
   * Infer TDD phase based on progress and phase name
   * @param {Object} phase - Phase object
   * @param {number} progress - Progress percentage
   * @returns {string} 'RED' | 'GREEN' | 'REFACTOR'
   */
  inferTDDPhase(phase, progress) {
    if (phase.name.includes('RED')) return 'RED';
    if (phase.name.includes('GREEN')) return 'GREEN';
    if (phase.name.includes('REFACTOR')) return 'REFACTOR';

    // Fallback: based on progress
    if (progress < 33) return 'RED';
    if (progress < 66) return 'GREEN';
    return 'REFACTOR';
  }

  /**
   * Generate a realistic commit for a phase
   * @param {Object} phase - Phase object
   * @param {string} tddPhase - TDD phase ('RED' | 'GREEN' | 'REFACTOR')
   * @param {number} milestone - Milestone percentage (25, 50, 75, 100)
   * @returns {Object} Commit object
   */
  generatePhaseCommit(_phase, tddPhase, milestone) {
    const messages = {
      RED: {
        25: 'test(cli): add failing tests for show command',
        50: 'test(cli): add edge case tests',
        75: 'test(cli): add integration tests',
        100: 'test(cli): add e2e tests',
      },
      GREEN: {
        25: 'feat(cli): implement minimal solution',
        50: 'feat(cli): handle edge cases',
        75: 'feat(cli): complete implementation',
        100: 'feat(cli): finalize feature',
      },
      REFACTOR: {
        25: 'refactor(cli): extract helper functions',
        50: 'refactor(cli): improve naming and structure',
        75: 'refactor(cli): optimize performance',
        100: 'refactor(cli): final polish and cleanup',
      },
    };

    // Realistic file changes by TDD phase
    const getStats = () => {
      const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

      switch (tddPhase) {
        case 'RED':
          return { files: rand(1, 3), add: rand(45, 100), del: rand(0, 5) };
        case 'GREEN':
          return { files: rand(2, 4), add: rand(80, 150), del: rand(5, 15) };
        case 'REFACTOR':
          return { files: rand(2, 5), add: rand(20, 60), del: rand(20, 60) };
        default:
          return { files: rand(1, 3), add: rand(20, 50), del: rand(5, 20) };
      }
    };

    const stat = getStats();

    return {
      sha: Math.random().toString(16).substr(2, 7),
      message: messages[tddPhase]?.[milestone] || `${tddPhase}: commit at ${milestone}%`,
      author: 'Claude Haiku',
      timestamp: 'just now',
      filesChanged: stat.files,
      additions: stat.add,
      deletions: stat.del,
      tddPhase,
    };
  }

  // ===== Backward compatibility aliases =====
  // These maintain compatibility with existing UI code

  get nodes() {
    return this.features;
  }
  set nodes(value) {
    this.features = value;
  }

  get selectedNodeId() {
    return this.selectedFeatureId;
  }
  set selectedNodeId(value) {
    this.selectedFeatureId = value;
  }

  createNode(parentId, title, phaseId, _shouldSave = true, desc = '') {
    return this.createFeature({
      parentId,
      title,
      phaseId,
      description: desc,
    });
  }

  deleteNode(nodeId) {
    return this.deleteFeature(nodeId);
  }

  updateNode(id, data) {
    return this.updateFeature(id, data);
  }

  getNode(id) {
    return this.getFeature(id);
  }

  /**
   * Environment management methods
   */
  getEnvironment(featureId) {
    if (!this.featureEnvironments[featureId]) {
      this.featureEnvironments[featureId] = {
        status: 'idle',
        url: null,
        port: null,
      };
    }
    return this.featureEnvironments[featureId];
  }

  setEnvironment(featureId, data) {
    this.featureEnvironments[featureId] = {
      ...this.getEnvironment(featureId),
      ...data,
    };
    this.save(); // Persist environment state changes
  }

  startEnvironment(featureId) {
    this.setEnvironment(featureId, { status: 'starting' });
  }

  runningEnvironment(featureId, url, port) {
    this.setEnvironment(featureId, { status: 'running', url, port });
  }

  stopEnvironment(featureId) {
    this.setEnvironment(featureId, { status: 'stopped', url: null, port: null });
  }
}
