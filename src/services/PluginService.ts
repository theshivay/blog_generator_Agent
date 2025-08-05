/**
 * Plugin Service
 * 
 * This service manages all plugins in the AI Agent system. It handles
 * plugin registration, activation detection, execution orchestration,
 * and result processing. The service supports both parallel and
 * sequential execution modes.
 */

import { BasePlugin, PluginContext, PluginResult, PluginSystemConfig } from '../types/plugin';
import { logger } from '../utils/logger';
import { WeatherPluginImpl } from '../plugins/WeatherPlugin';
import { MathPluginImpl } from '../plugins/MathPlugin';

// ============================================================================
// PLUGIN SERVICE IMPLEMENTATION
// ============================================================================

export class PluginService {
  private plugins: Map<string, BasePlugin>;
  private config: PluginSystemConfig;

  constructor(config: Partial<PluginSystemConfig> = {}) {
    this.plugins = new Map();
    
    // Default configuration
    this.config = {
      enabled: true,
      max_plugins_per_request: 3,
      plugin_timeout_ms: 30000,
      execution_mode: 'sequential',
      discovery: {
        auto_load: false
      },
      security: {
        sandbox_enabled: false,
        network_access: 'limited',
        file_access: 'read-only'
      },
      caching: {
        enabled: false,
        default_ttl_seconds: 300,
        max_cache_size_mb: 100
      },
      ...config
    };

    this.initializeDefaultPlugins();
  }

  /**
   * Initialize the default plugins (Weather and Math)
   */
  private initializeDefaultPlugins(): void {
    try {
      // Initialize Weather Plugin
      const weatherApiKey = process.env['OPENWEATHER_API_KEY'];
      const weatherPlugin = new WeatherPluginImpl(weatherApiKey);
      this.registerPlugin(weatherPlugin);

      // Initialize Math Plugin
      const mathPlugin = new MathPluginImpl();
      this.registerPlugin(mathPlugin);

      logger.info('Default plugins initialized successfully', {
        plugins: Array.from(this.plugins.keys())
      });

    } catch (error) {
      logger.error('Failed to initialize default plugins', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Register a plugin with the service
   */
  registerPlugin(plugin: BasePlugin): void {
    if (this.plugins.has(plugin.name)) {
      logger.warn(`Plugin ${plugin.name} is already registered`);
      return;
    }

    this.plugins.set(plugin.name, plugin);
    logger.info(`Plugin registered: ${plugin.name}`, {
      name: plugin.name,
      version: plugin.version,
      enabled: plugin.enabled
    });
  }

  /**
   * Unregister a plugin from the service
   */
  unregisterPlugin(pluginId: string): boolean {
    const removed = this.plugins.delete(pluginId);
    if (removed) {
      logger.info(`Plugin unregistered: ${pluginId}`);
    }
    return removed;
  }

  /**
   * Get information about all registered plugins
   */
  getPlugins(): Array<{
    id: string;
    name: string;
    description: string;
    version: string;
    enabled: boolean;
    priority: number;
    triggers: string[];
  }> {
    return Array.from(this.plugins.values()).map(plugin => ({
      id: plugin.name, // Using name as id for consistency
      name: plugin.name,
      description: plugin.description,
      version: plugin.version,
      enabled: plugin.enabled,
      priority: plugin.priority,
      triggers: plugin.triggers
    }));
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): BasePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Enable or disable a specific plugin
   */
  setPluginEnabled(pluginId: string, enabled: boolean): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    plugin.enabled = enabled;
    logger.info(`Plugin ${pluginId} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Process user input and execute relevant plugins
   */
  async processInput(
    input: string,
    context: PluginContext
  ): Promise<{
    plugins_executed: Array<{
      plugin_id: string;
      result: PluginResult;
    }>;
    execution_summary: {
      total_plugins_activated: number;
      successful_executions: number;
      failed_executions: number;
      total_execution_time_ms: number;
    };
  }> {
    const startTime = Date.now();
    
    if (!this.config.enabled) {
      return {
        plugins_executed: [],
        execution_summary: {
          total_plugins_activated: 0,
          successful_executions: 0,
          failed_executions: 0,
          total_execution_time_ms: Date.now() - startTime
        }
      };
    }

    try {
      // Find plugins that should activate for this input
      const activatedPlugins = await this.findActivatedPlugins(input, context);

      if (activatedPlugins.length === 0) {
        logger.debug('No plugins activated for input', { input: input.substring(0, 100) });
        return {
          plugins_executed: [],
          execution_summary: {
            total_plugins_activated: 0,
            successful_executions: 0,
            failed_executions: 0,
            total_execution_time_ms: Date.now() - startTime
          }
        };
      }

      // Execute activated plugins
      const pluginResults = await this.executePlugins(activatedPlugins, input, context);

      // Calculate execution summary
      const successfulExecutions = pluginResults.filter(r => r.result.success).length;
      const failedExecutions = pluginResults.length - successfulExecutions;

      const executionSummary = {
        total_plugins_activated: activatedPlugins.length,
        successful_executions: successfulExecutions,
        failed_executions: failedExecutions,
        total_execution_time_ms: Date.now() - startTime
      };

      logger.info('Plugin processing completed', executionSummary);

      return {
        plugins_executed: pluginResults,
        execution_summary: executionSummary
      };

    } catch (error) {
      logger.error('Plugin processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: context.session_id
      });

      return {
        plugins_executed: [],
        execution_summary: {
          total_plugins_activated: 0,
          successful_executions: 0,
          failed_executions: 1,
          total_execution_time_ms: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Validate all registered plugins
   */
  async validatePlugins(): Promise<{
    valid_plugins: string[];
    invalid_plugins: Array<{
      plugin_id: string;
      issues: {
        errors: string[];
        warnings: string[];
        missing_dependencies: string[];
        config_issues: string[];
      };
    }>;
  }> {
    const validPlugins: string[] = [];
    const invalidPlugins: Array<{
      plugin_id: string;
      issues: {
        errors: string[];
        warnings: string[];
        missing_dependencies: string[];
        config_issues: string[];
      };
    }> = [];

    for (const [pluginId, plugin] of this.plugins) {
      try {
        const validation = await plugin.validate();
        
        const hasErrors = validation.errors.length > 0 || 
                         validation.missing_dependencies.length > 0 ||
                         validation.config_issues.length > 0;

        if (hasErrors) {
          invalidPlugins.push({
            plugin_id: pluginId,
            issues: validation
          });
        } else {
          validPlugins.push(pluginId);
        }

      } catch (error) {
        invalidPlugins.push({
          plugin_id: pluginId,
          issues: {
            errors: [`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
            warnings: [],
            missing_dependencies: [],
            config_issues: []
          }
        });
      }
    }

    return { valid_plugins: validPlugins, invalid_plugins: invalidPlugins };
  }

  /**
   * Update plugin service configuration
   */
  updateConfig(newConfig: Partial<PluginSystemConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Plugin service configuration updated', this.config);
  }

  /**
   * Get current plugin service configuration
   */
  getConfig(): PluginSystemConfig {
    return { ...this.config };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Find plugins that should activate for the given input
   */
  private async findActivatedPlugins(
    input: string,
    context: PluginContext
  ): Promise<BasePlugin[]> {
    const activatedPlugins: BasePlugin[] = [];

    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) {
        continue;
      }

      try {
        const shouldActivate = plugin.shouldActivate(input, context);
        if (shouldActivate) {
          activatedPlugins.push(plugin);
        }
      } catch (error) {
        logger.error(`Failed to check activation for plugin ${plugin.name}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: context.session_id
        });
      }
    }

    // Sort by priority (higher priority first)
    activatedPlugins.sort((a, b) => b.priority - a.priority);

    // Limit the number of plugins per request
    return activatedPlugins.slice(0, this.config.max_plugins_per_request);
  }

  /**
   * Execute the activated plugins
   */
  private async executePlugins(
    plugins: BasePlugin[],
    input: string,
    context: PluginContext
  ): Promise<Array<{ plugin_id: string; result: PluginResult }>> {
    if (this.config.execution_mode === 'parallel') {
      return this.executePluginsParallel(plugins, input, context);
    } else {
      return this.executePluginsSequential(plugins, input, context);
    }
  }

  /**
   * Execute plugins in parallel
   */
  private async executePluginsParallel(
    plugins: BasePlugin[],
    input: string,
    context: PluginContext
  ): Promise<Array<{ plugin_id: string; result: PluginResult }>> {
    const promises = plugins.map(async plugin => {
      try {
        const result = await Promise.race([
          plugin.execute(input, context),
          this.createTimeoutPromise(plugin.name)
        ]);

        return { plugin_id: plugin.name, result };
      } catch (error) {
        logger.error(`Plugin ${plugin.name} execution failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: context.session_id
        });

        return {
          plugin_id: plugin.name,
          result: {
            success: false,
            data: null,
            message: 'Plugin execution failed',
            error: {
              code: 'EXECUTION_ERROR',
              message: 'Plugin execution failed'
            },
            metadata: {
              execution_time_ms: 0,
              plugin_version: plugin.version
            }
          }
        };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Execute plugins sequentially
   */
  private async executePluginsSequential(
    plugins: BasePlugin[],
    input: string,
    context: PluginContext
  ): Promise<Array<{ plugin_id: string; result: PluginResult }>> {
    const results: Array<{ plugin_id: string; result: PluginResult }> = [];

    for (const plugin of plugins) {
      try {
        const result = await Promise.race([
          plugin.execute(input, context),
          this.createTimeoutPromise(plugin.name)
        ]);

        results.push({ plugin_id: plugin.name, result });

        // If a plugin succeeds and provides a definitive answer, 
        // we might choose to stop here (depending on use case)
        // For now, we continue executing all activated plugins

      } catch (error) {
        logger.error(`Plugin ${plugin.name} execution failed`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          sessionId: context.session_id
        });

        results.push({
          plugin_id: plugin.name,
          result: {
            success: false,
            data: null,
            message: 'Plugin execution failed',
            error: {
              code: 'EXECUTION_ERROR',
              message: 'Plugin execution failed'
            },
            metadata: {
              execution_time_ms: 0,
              plugin_version: plugin.version
            }
          }
        });
      }
    }

    return results;
  }

  /**
   * Create a timeout promise for plugin execution
   */
  private createTimeoutPromise(pluginId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Plugin ${pluginId} execution timed out after ${this.config.plugin_timeout_ms}ms`));
      }, this.config.plugin_timeout_ms);
    });
  }
}
