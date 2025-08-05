/**
 * Base Plugin Implementation
 * 
 * This file provides the base class and interfaces that all plugins
 * must implement. It defines the standard p      presentation: formattedText ? {
        formatted_text: formattedText,
        include_raw_data: false
      } : undefined,n lifecycle and
 * provides common functionality.
 */

import { 
  BasePlugin, 
  PluginContext, 
  PluginResult, 
  PluginValidationResult 
} from '../types/plugin';
import { logger } from '../utils/logger';

// ============================================================================
// ABSTRACT BASE PLUGIN CLASS
// ============================================================================

/**
 * Abstract base class that provides common plugin functionality
 */
export abstract class AbstractBasePlugin implements BasePlugin {
  public readonly name: string;
  public readonly description: string;
  public readonly version: string;
  public readonly triggers: string[];
  public readonly priority: number;
  public enabled: boolean = true;

  constructor(
    name: string,
    description: string,
    version: string,
    triggers: string[],
    priority: number = 1
  ) {
    this.name = name;
    this.description = description;
    this.version = version;
    this.triggers = triggers;
    this.priority = priority;
  }

  /**
   * Check if this plugin should handle the given input
   * Base implementation checks for trigger words
   */
  shouldActivate(input: string, _context: PluginContext): boolean {
    if (!this.enabled) {
      return false;
    }

    const inputLower = input.toLowerCase();
    
    // Check if any trigger words are present in the input
    return this.triggers.some(trigger => {
      const triggerLower = trigger.toLowerCase();
      return inputLower.includes(triggerLower);
    });
  }

  /**
   * Abstract method that must be implemented by concrete plugins
   */
  abstract execute(input: string, context: PluginContext): Promise<PluginResult>;

  /**
   * Validate plugin configuration and dependencies
   * Base implementation provides basic validation
   */
  async validate(): Promise<PluginValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missing_dependencies: string[] = [];
    const config_issues: string[] = [];

    // Basic validation
    if (!this.name || this.name.trim().length === 0) {
      errors.push('Plugin name is required');
    }

    if (!this.version || this.version.trim().length === 0) {
      errors.push('Plugin version is required');
    }

    if (!this.triggers || this.triggers.length === 0) {
      warnings.push('Plugin has no trigger words defined');
    }

    // Allow subclasses to add their own validation
    const customValidation = await this.customValidation();
    errors.push(...customValidation.errors);
    warnings.push(...customValidation.warnings);
    missing_dependencies.push(...customValidation.missing_dependencies);
    config_issues.push(...customValidation.config_issues);

    return {
      valid: errors.length === 0 && missing_dependencies.length === 0,
      errors,
      warnings,
      missing_dependencies,
      config_issues
    };
  }

  /**
   * Override this method to provide custom validation logic
   */
  protected async customValidation(): Promise<{
    errors: string[];
    warnings: string[];
    missing_dependencies: string[];
    config_issues: string[];
  }> {
    return {
      errors: [],
      warnings: [],
      missing_dependencies: [],
      config_issues: []
    };
  }

  /**
   * Clean up resources when the plugin is disabled
   * Override this method if your plugin needs cleanup
   */
  async cleanup(): Promise<void> {
    logger.debug(`Cleaning up plugin: ${this.name}`);
  }

  /**
   * Create a standardized success result
   */
  protected createSuccessResult(
    data: unknown,
    message: string,
    executionTime: number = 0
  ): PluginResult {
    return {
      success: true,
      data,
      message,
      metadata: {
        execution_time_ms: executionTime,
        plugin_version: this.version,
        confidence: 1.0,
        cacheable: true,
        cache_ttl_seconds: 300 // 5 minutes default
      },
      presentation: {
        formatted_text: message,
        include_raw_data: false
      }
    };
  }

  /**
   * Create a standardized error result
   */
  protected createErrorResult(
    error: string,
    code: string = 'PLUGIN_ERROR',
    executionTime: number = 0
  ): PluginResult {
    return {
      success: false,
      error: {
        code,
        message: error,
        details: {}
      },
      metadata: {
        execution_time_ms: executionTime,
        plugin_version: this.version
      }
    };
  }

  /**
   * Extract parameters from input text using regex patterns
   */
  protected extractParameters(
    input: string,
    patterns: Record<string, RegExp>
  ): Record<string, string | null> {
    const parameters: Record<string, string | null> = {};

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = input.match(pattern);
      parameters[key] = match ? match[1] : null;
    }

    return parameters;
  }

  /**
   * Check if required parameters are present
   */
  protected validateRequiredParameters(
    parameters: Record<string, string | null>,
    required: string[]
  ): { valid: boolean; missing: string[] } {
    const missing = required.filter(param => !parameters[param]);
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Log plugin execution
   */
  protected logExecution(
    input: string,
    result: PluginResult,
    context: PluginContext
  ): void {
    logger.info(`Plugin executed: ${this.name}`, {
      sessionId: context.session_id,
      success: result.success,
      executionTime: result.metadata.execution_time_ms,
      inputLength: input.length
    });
  }
}

// ============================================================================
// PLUGIN EXECUTION HELPER
// ============================================================================

/**
 * Helper function to safely execute a plugin with error handling and timing
 */
export async function executePluginSafely(
  plugin: BasePlugin,
  input: string,
  context: PluginContext
): Promise<PluginResult> {
  const startTime = Date.now();
  
  try {
    logger.debug(`Executing plugin: ${plugin.name}`, {
      sessionId: context.session_id
    });

    // Check if plugin is enabled
    if (!plugin.enabled) {
      return {
        success: false,
        error: {
          code: 'PLUGIN_DISABLED',
          message: `Plugin ${plugin.name} is disabled`
        },
        metadata: {
          execution_time_ms: Date.now() - startTime,
          plugin_version: plugin.version
        }
      };
    }

    // Execute the plugin
    const result = await plugin.execute(input, context);
    
    // Ensure execution time is set
    if (!result.metadata.execution_time_ms) {
      result.metadata.execution_time_ms = Date.now() - startTime;
    }

    logger.debug(`Plugin execution completed: ${plugin.name}`, {
      sessionId: context.session_id,
      success: result.success,
      executionTime: result.metadata.execution_time_ms
    });

    return result;

  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error(`Plugin execution failed: ${plugin.name}`, {
      sessionId: context.session_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTime
    });

    return {
      success: false,
      error: {
        code: 'PLUGIN_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: {
          plugin: plugin.name,
          version: plugin.version
        }
      },
      metadata: {
        execution_time_ms: executionTime,
        plugin_version: plugin.version
      }
    };
  }
}

// ============================================================================
// PLUGIN UTILITIES
// ============================================================================

/**
 * Utility to sort plugins by priority (higher priority first)
 */
export function sortPluginsByPriority(plugins: BasePlugin[]): BasePlugin[] {
  return [...plugins].sort((a, b) => b.priority - a.priority);
}

/**
 * Utility to filter enabled plugins
 */
export function filterEnabledPlugins(plugins: BasePlugin[]): BasePlugin[] {
  return plugins.filter(plugin => plugin.enabled);
}

/**
 * Utility to find plugins that should activate for given input
 */
export function findActivatingPlugins(
  plugins: BasePlugin[],
  input: string,
  context: PluginContext
): BasePlugin[] {
  return plugins.filter(plugin => plugin.shouldActivate(input, context));
}

/**
 * Create a basic plugin context for testing
 */
export function createTestContext(sessionId: string = 'test-session'): PluginContext {
  return {
    session_id: sessionId,
    conversation_history: [],
    metadata: {
      request_timestamp: new Date(),
      request_source: 'test'
    }
  };
}
