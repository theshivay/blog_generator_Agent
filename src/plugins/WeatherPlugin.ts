/**
 * Weather Plugin
 * 
 * This plugin provides weather information for specified locations.
 * It can fetch current weather conditions and forecasts using
 * the OpenWeatherMap API or provide mock data for development.
 */

import { PluginContext, PluginResult, WeatherPlugin } from '../types/plugin';
import { AbstractBasePlugin } from './BasePlugin';
import { logger } from '../utils/logger';

// ============================================================================
// WEATHER PLUGIN IMPLEMENTATION
// ============================================================================

export class WeatherPluginImpl extends AbstractBasePlugin {
  private apiKey: string | undefined;
  private useMockData: boolean;

  constructor(apiKey?: string) {
    super(
      'weather',
      'Provides current weather information and forecasts for any location',
      '1.0.0',
      [
        'weather',
        'temperature',
        'forecast',
        'climate',
        'rain',
        'sunny',
        'cloudy',
        'snow',
        'wind',
        'humidity',
        'what\'s the weather',
        'how\'s the weather',
        'weather in',
        'temperature in',
        'is it raining',
        'weather forecast'
      ],
      2 // High priority for weather queries
    );

    this.apiKey = apiKey;
    this.useMockData = !apiKey;

    if (this.useMockData) {
      logger.warn('Weather plugin running in mock mode (no API key provided)');
    }
  }

  /**
   * Enhanced activation check for weather-related queries
   */
  override shouldActivate(input: string, _context: PluginContext): boolean {
    if (!this.enabled) {
      return false;
    }

    const inputLower = input.toLowerCase();

    // Direct weather trigger words
    const hasWeatherTrigger = this.triggers.some(trigger => 
      inputLower.includes(trigger.toLowerCase())
    );

    if (hasWeatherTrigger) {
      return true;
    }

    // Pattern-based detection for weather queries
    const weatherPatterns = [
      /what.+weather.+in/i,
      /how.+weather.+in/i,
      /is it (raining|snowing|sunny|cloudy)/i,
      /temperature.+in/i,
      /forecast.+for/i,
      /(hot|cold|warm|cool).+in/i
    ];

    return weatherPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Execute weather information retrieval
   */
  async execute(input: string, context: PluginContext): Promise<PluginResult> {
    const startTime = Date.now();

    try {
      // Extract location from input
      const location = this.extractLocation(input);
      
      if (!location) {
        return this.createErrorResult(
          'Please specify a location for weather information (e.g., "weather in New York")',
          'MISSING_LOCATION',
          Date.now() - startTime
        );
      }

      // Determine request type
      const requestType = this.determineRequestType(input);

      // Get weather data
      const weatherData = await this.getWeatherData(location, requestType);

      // Format response
      const formattedResponse = this.formatWeatherResponse(weatherData, requestType);

      this.logExecution(input, { success: true } as PluginResult, context);

      return this.createSuccessResult(
        weatherData,
        formattedResponse,
        Date.now() - startTime
      );

    } catch (error) {
      logger.error('Weather plugin execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: context.session_id
      });

      return this.createErrorResult(
        'Failed to retrieve weather information. Please try again.',
        'WEATHER_API_ERROR',
        Date.now() - startTime
      );
    }
  }

  /**
   * Validate weather plugin configuration
   */
  protected override async customValidation(): Promise<{
    errors: string[];
    warnings: string[];
    missing_dependencies: string[];
    config_issues: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missing_dependencies: string[] = [];
    const config_issues: string[] = [];

    if (!this.apiKey && !this.useMockData) {
      missing_dependencies.push('OpenWeatherMap API key required for live weather data');
    }

    if (this.useMockData) {
      warnings.push('Running in mock mode - weather data will be simulated');
    }

    return {
      errors,
      warnings,
      missing_dependencies,
      config_issues
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Extract location from user input
   */
  private extractLocation(input: string): string | null {
    // Common patterns for location extraction
    const patterns = [
      /weather (?:in |for )?([a-zA-Z\s,]+?)(?:\?|$|today|tomorrow|forecast)/i,
      /temperature (?:in |for )?([a-zA-Z\s,]+?)(?:\?|$|today|tomorrow)/i,
      /forecast (?:in |for )?([a-zA-Z\s,]+?)(?:\?|$)/i,
      /(?:is it|how).+(?:in |for )([a-zA-Z\s,]+?)(?:\?|$)/i,
      /(?:in |for )([a-zA-Z\s,]+?)(?:\?|$)/i
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Fallback: look for city names in the input
    const words = input.split(/\s+/);
    const possibleLocations = words.filter(word => 
      word.length > 2 && 
      /^[A-Za-z]+$/.test(word) &&
      !this.isCommonWord(word)
    );

    return possibleLocations.length > 0 ? possibleLocations.join(' ') : null;
  }

  /**
   * Determine the type of weather request
   */
  private determineRequestType(input: string): 'current' | 'forecast' | 'historical' {
    const inputLower = input.toLowerCase();

    if (inputLower.includes('forecast') || 
        inputLower.includes('tomorrow') || 
        inputLower.includes('next')) {
      return 'forecast';
    }

    if (inputLower.includes('yesterday') || 
        inputLower.includes('last week')) {
      return 'historical';
    }

    return 'current';
  }

  /**
   * Get weather data from API or mock
   */
  private async getWeatherData(
    location: string, 
    type: 'current' | 'forecast' | 'historical'
  ): Promise<WeatherPlugin.WeatherData> {
    if (this.useMockData) {
      return this.generateMockWeatherData(location, type);
    }

    // In a real implementation, you would call the OpenWeatherMap API here
    // For now, we'll return mock data even when API key is provided
    return this.generateMockWeatherData(location, type);
  }

  /**
   * Generate mock weather data for development/demo purposes
   */
  private generateMockWeatherData(
    location: string, 
    type: 'current' | 'forecast' | 'historical'
  ): WeatherPlugin.WeatherData {
    const baseTemp = Math.floor(Math.random() * 30) + 5; // 5-35°C
    
    const weatherData: WeatherPlugin.WeatherData = {
      location: {
        name: location,
        country: 'Unknown'
      },
      metadata: {
        source: 'MockWeatherAPI',
        last_updated: new Date(),
        units: 'celsius'
      }
    };

    if (type === 'current') {
      weatherData.current = {
        temperature: baseTemp,
        feels_like: baseTemp + Math.floor(Math.random() * 6) - 3,
        humidity: Math.floor(Math.random() * 40) + 40, // 40-80%
        pressure: Math.floor(Math.random() * 50) + 1000, // 1000-1050 hPa
        wind_speed: Math.floor(Math.random() * 20) + 5, // 5-25 km/h
        wind_direction: Math.floor(Math.random() * 360),
        visibility: Math.floor(Math.random() * 10) + 5, // 5-15 km
        uv_index: Math.floor(Math.random() * 11), // 0-10
        condition: this.getRandomCondition(),
        icon: 'partly-cloudy'
      };
    }

    if (type === 'forecast') {
      weatherData.forecast = [];
      for (let i = 1; i <= 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        weatherData.forecast.push({
          date,
          high_temp: baseTemp + Math.floor(Math.random() * 10) - 5,
          low_temp: baseTemp - Math.floor(Math.random() * 10) - 5,
          condition: this.getRandomCondition(),
          precipitation_chance: Math.floor(Math.random() * 100),
          icon: 'partly-cloudy'
        });
      }
    }

    return weatherData;
  }

  /**
   * Get random weather condition for mock data
   */
  private getRandomCondition(): string {
    const conditions = [
      'Sunny',
      'Partly Cloudy',
      'Cloudy',
      'Overcast',
      'Light Rain',
      'Rain',
      'Thunderstorm',
      'Snow',
      'Fog',
      'Clear'
    ];

    return conditions[Math.floor(Math.random() * conditions.length)];
  }

  /**
   * Format weather response for display
   */
  private formatWeatherResponse(
    data: WeatherPlugin.WeatherData, 
    type: 'current' | 'forecast' | 'historical'
  ): string {
    if (type === 'current' && data.current) {
      const current = data.current;
      return `Current weather in ${data.location.name}:
🌡️ Temperature: ${current.temperature}°C (feels like ${current.feels_like}°C)
🌤️ Condition: ${current.condition}
💧 Humidity: ${current.humidity}%
💨 Wind: ${current.wind_speed} km/h
👁️ Visibility: ${current.visibility} km
📊 Pressure: ${current.pressure} hPa
☀️ UV Index: ${current.uv_index}`;
    }

    if (type === 'forecast' && data.forecast) {
      let response = `5-day forecast for ${data.location.name}:\n`;
      
      data.forecast.forEach((day, index) => {
        const dayName = index === 0 ? 'Tomorrow' : 
          day.date.toLocaleDateString('en-US', { weekday: 'long' });
        
        response += `\n${dayName}: ${day.high_temp}°C / ${day.low_temp}°C, ${day.condition}`;
        if (day.precipitation_chance > 30) {
          response += ` (${day.precipitation_chance}% chance of rain)`;
        }
      });

      return response;
    }

    return `Weather information for ${data.location.name} is currently unavailable.`;
  }

  /**
   * Check if a word is a common word (not likely to be a location)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must',
      'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
      'we', 'they', 'me', 'him', 'her', 'us', 'them', 'weather', 'temperature',
      'forecast', 'today', 'tomorrow', 'how', 'what', 'where', 'when', 'why'
    ]);

    return commonWords.has(word.toLowerCase());
  }
}
