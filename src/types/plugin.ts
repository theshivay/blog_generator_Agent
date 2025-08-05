/**
 * Plugin System Types
 * 
 * This file defines the interfaces and types for the extensible plugin system.
 * Plugins allow the agent to perform specific tasks beyond text generation.
 */

// ============================================================================
// CORE PLUGIN TYPES
// ============================================================================

/**
 * Base interface that all plugins must implement
 */
export interface BasePlugin {
  /** Unique identifier for the plugin */
  readonly name: string;
  
  /** Human-readable description of what the plugin does */
  readonly description: string;
  
  /** Version of the plugin */
  readonly version: string;
  
  /** List of trigger words or phrases that activate this plugin */
  readonly triggers: string[];
  
  /** Priority level for plugin execution (higher = more priority) */
  readonly priority: number;
  
  /** Whether this plugin is currently enabled */
  enabled: boolean;
  
  /**
   * Check if this plugin should handle the given input
   * @param input The user's message
   * @param context Additional context about the request
   * @returns true if this plugin should be executed
   */
  shouldActivate(input: string, context: PluginContext): boolean;
  
  /**
   * Execute the plugin's main functionality
   * @param input The user's message
   * @param context Additional context about the request
   * @returns The result of the plugin execution
   */
  execute(input: string, context: PluginContext): Promise<PluginResult>;
  
  /**
   * Validate plugin configuration and dependencies
   * @returns Validation result
   */
  validate(): Promise<PluginValidationResult>;
  
  /**
   * Clean up resources when the plugin is disabled
   */
  cleanup?(): Promise<void>;
}

/**
 * Context provided to plugins during execution
 */
export interface PluginContext {
  /** Session identifier for tracking */
  session_id: string;
  
  /** Recent conversation history */
  conversation_history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  
  /** User preferences or settings */
  user_preferences?: Record<string, unknown>;
  
  /** Timezone of the user (if available) */
  timezone?: string;
  
  /** Location information (if available and permitted) */
  location?: {
    city?: string;
    country?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  
  /** Additional metadata */
  metadata: {
    /** When the request was made */
    request_timestamp: Date;
    /** Source of the request */
    request_source?: string;
    /** Any custom data */
    custom?: Record<string, unknown>;
  };
}

/**
 * Result returned by plugin execution
 */
export interface PluginResult {
  /** Whether the plugin execution was successful */
  success: boolean;
  
  /** The main result data */
  data?: unknown;
  
  /** Human-readable message about the result */
  message?: string;
  
  /** Error information if execution failed */
  error?: {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Additional error details */
    details?: Record<string, unknown>;
  };
  
  /** Execution metadata */
  metadata: {
    /** Time taken to execute in milliseconds */
    execution_time_ms: number;
    /** Plugin version that generated this result */
    plugin_version: string;
    /** Confidence score of the result (0-1) */
    confidence?: number;
    /** Whether this result should be cached */
    cacheable?: boolean;
    /** TTL for caching in seconds */
    cache_ttl_seconds?: number;
  };
  
  /** How this result should be presented to the user */
  presentation?: {
    /** Formatted text for display */
    formatted_text?: string;
    /** Whether to include raw data in response */
    include_raw_data?: boolean;
    /** Suggested follow-up questions */
    suggested_followups?: string[];
  };
}

/**
 * Result of plugin validation
 */
export interface PluginValidationResult {
  /** Whether the plugin is valid and ready to use */
  valid: boolean;
  
  /** Validation errors (if any) */
  errors: string[];
  
  /** Validation warnings (if any) */
  warnings: string[];
  
  /** Required dependencies that are missing */
  missing_dependencies: string[];
  
  /** Configuration issues */
  config_issues: string[];
}

// ============================================================================
// PLUGIN MANAGEMENT TYPES
// ============================================================================

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  /** The plugin instance */
  plugin: BasePlugin;
  
  /** Registration metadata */
  metadata: {
    /** When the plugin was registered */
    registered_at: Date;
    /** Who registered the plugin */
    registered_by?: string;
    /** Plugin configuration */
    config?: Record<string, unknown>;
  };
  
  /** Runtime statistics */
  stats: {
    /** Number of times the plugin has been executed */
    execution_count: number;
    /** Total execution time across all calls */
    total_execution_time_ms: number;
    /** Number of successful executions */
    success_count: number;
    /** Number of failed executions */
    failure_count: number;
    /** Last execution timestamp */
    last_executed_at?: Date;
  };
}

/**
 * Plugin execution plan
 */
export interface PluginExecutionPlan {
  /** Plugins to execute in order */
  plugins_to_execute: Array<{
    /** Plugin name */
    plugin_name: string;
    /** Reason why this plugin was selected */
    selection_reason: string;
    /** Expected execution parameters */
    parameters?: Record<string, unknown>;
  }>;
  
  /** Execution metadata */
  metadata: {
    /** How the plan was generated */
    planning_strategy: string;
    /** Time taken to create the plan */
    planning_time_ms: number;
    /** Confidence in the plan */
    confidence_score: number;
  };
}

/**
 * Result of executing multiple plugins
 */
export interface PluginExecutionSummary {
  /** Results from individual plugins */
  plugin_results: Array<{
    /** Plugin name */
    plugin_name: string;
    /** Execution result */
    result: PluginResult;
  }>;
  
  /** Overall execution metadata */
  summary: {
    /** Total execution time for all plugins */
    total_execution_time_ms: number;
    /** Number of successful executions */
    successful_executions: number;
    /** Number of failed executions */
    failed_executions: number;
    /** Combined confidence score */
    overall_confidence?: number;
  };
}

// ============================================================================
// SPECIFIC PLUGIN TYPES
// ============================================================================

/**
 * Weather plugin specific types
 */
export namespace WeatherPlugin {
  export interface WeatherRequest {
    /** Location to get weather for */
    location: string;
    /** Type of weather information requested */
    type?: 'current' | 'forecast' | 'historical';
    /** Units for temperature */
    units?: 'celsius' | 'fahrenheit' | 'kelvin';
  }
  
  export interface WeatherData {
    /** Location information */
    location: {
      name: string;
      country: string;
      coordinates?: {
        latitude: number;
        longitude: number;
      };
    };
    
    /** Current weather conditions */
    current?: {
      temperature: number;
      feels_like: number;
      humidity: number;
      pressure: number;
      wind_speed: number;
      wind_direction: number;
      visibility: number;
      uv_index: number;
      condition: string;
      icon?: string;
    };
    
    /** Weather forecast */
    forecast?: Array<{
      date: Date;
      high_temp: number;
      low_temp: number;
      condition: string;
      precipitation_chance: number;
      icon?: string;
    }>;
    
    /** Data source and timestamp */
    metadata: {
      source: string;
      last_updated: Date;
      units: string;
    };
  }
}

/**
 * Math plugin specific types
 */
export namespace MathPlugin {
  export type OperationType = 
    | 'arithmetic'
    | 'percentage' 
    | 'trigonometry'
    | 'logarithmic'
    | 'exponential'
    | 'factorial'
    | 'unit_conversion'
    | 'basic';
    
  export interface MathExpression {
    /** The mathematical expression to evaluate */
    expression: string;
    /** Variables and their values (if any) */
    variables?: Record<string, number>;
  }
  
  export interface MathResult {
    /** The original expression */
    expression: string;
    /** The calculated result */
    result: number | string;
    /** Step-by-step solution (if available) */
    steps?: string[];
    /** Whether the expression was valid */
    valid: boolean;
    /** Error message if invalid */
    error?: string;
    /** Additional mathematical properties */
    properties?: {
      /** Type of result (integer, decimal, fraction, etc.) */
      result_type: string;
      /** Precision of the calculation */
      precision: number;
      /** Whether the result is exact or approximate */
      exact: boolean;
    };
  }
}

// ============================================================================
// PLUGIN CONFIGURATION TYPES
// ============================================================================

/**
 * Configuration for the plugin system
 */
export interface PluginSystemConfig {
  /** Whether the plugin system is enabled */
  enabled: boolean;
  
  /** Maximum number of plugins to execute per request */
  max_plugins_per_request: number;
  
  /** Timeout for plugin execution in milliseconds */
  plugin_timeout_ms: number;
  
  /** Whether to run plugins in parallel or sequential */
  execution_mode: 'parallel' | 'sequential';
  
  /** Plugin discovery settings */
  discovery: {
    /** Directories to search for plugins */
    plugin_directories?: string[];
    /** Whether to auto-load plugins */
    auto_load: boolean;
    /** Plugin file patterns to match */
    file_patterns?: string[];
  };
  
  /** Security settings */
  security: {
    /** Whether to run plugins in sandbox */
    sandbox_enabled: boolean;
    /** Maximum memory usage per plugin */
    max_memory_mb?: number;
    /** Allowed network access for plugins */
    network_access: 'none' | 'limited' | 'full';
    /** Allowed file system access */
    file_access: 'none' | 'read-only' | 'full';
  };
  
  /** Caching settings */
  caching: {
    /** Whether to cache plugin results */
    enabled: boolean;
    /** Default cache TTL in seconds */
    default_ttl_seconds: number;
    /** Maximum cache size */
    max_cache_size_mb: number;
  };
}

/**
 * Plugin-specific configuration
 */
export interface PluginConfig {
  /** Plugin name */
  name: string;
  
  /** Whether this plugin is enabled */
  enabled: boolean;
  
  /** Plugin-specific settings */
  settings: Record<string, unknown>;
  
  /** Rate limiting for this plugin */
  rate_limit?: {
    /** Maximum calls per time window */
    max_calls: number;
    /** Time window in seconds */
    window_seconds: number;
  };
  
  /** Caching settings for this plugin */
  caching?: {
    /** Whether to cache results for this plugin */
    enabled: boolean;
    /** Cache TTL in seconds */
    ttl_seconds: number;
  };
  
  /** Priority for this plugin */
  priority?: number;
}

// ============================================================================
// PLUGIN LIFECYCLE TYPES
// ============================================================================

/**
 * Plugin lifecycle events
 */
export enum PluginLifecycleEvent {
  REGISTERED = 'registered',
  ENABLED = 'enabled',
  DISABLED = 'disabled',
  EXECUTED = 'executed',
  ERROR = 'error',
  UNREGISTERED = 'unregistered'
}

/**
 * Plugin lifecycle event data
 */
export interface PluginLifecycleEventData {
  /** The event type */
  event: PluginLifecycleEvent;
  
  /** Plugin name */
  plugin_name: string;
  
  /** Timestamp of the event */
  timestamp: Date;
  
  /** Additional event data */
  data?: {
    /** Execution time (for executed events) */
    execution_time_ms?: number;
    /** Error information (for error events) */
    error?: string;
    /** Previous state (for state change events) */
    previous_state?: string;
    /** New state (for state change events) */
    new_state?: string;
  };
}
