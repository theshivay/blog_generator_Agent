/**
 * Math Plugin
 * 
 * This plugin provides mathematical computation capabilities including
 * basic arithmetic, complex expressions, unit conversions, and statistical
 * calculations. It uses the mathjs library for safe expression evaluation.
 */

import { PluginContext, PluginResult, MathPlugin } from '../types/plugin';
import { AbstractBasePlugin } from './BasePlugin';
import { logger } from '../utils/logger';

// Import mathjs for safe mathematical evaluation
import { create, all, MathJsStatic } from 'mathjs';

// ============================================================================
// MATH PLUGIN IMPLEMENTATION
// ============================================================================

export class MathPluginImpl extends AbstractBasePlugin {
  private mathjs: MathJsStatic;

  constructor() {
    super(
      'math',
      'Performs mathematical calculations, evaluates expressions, and provides unit conversions',
      '1.0.0',
      [
        'calculate',
        'math',
        'compute',
        'solve',
        'equation',
        'formula',
        'add',
        'subtract',
        'multiply',
        'divide',
        'percentage',
        'percent',
        'square',
        'sqrt',
        'power',
        'factorial',
        'sin',
        'cos',
        'tan',
        'log',
        'ln',
        'convert',
        'what is',
        'how much is',
        '+',
        '-',
        '*',
        '/',
        '=',
        '²',
        '³'
      ],
      3 // High priority for math queries
    );

    // Initialize mathjs with safe configuration
    this.mathjs = create(all);
  }

  /**
   * Enhanced activation check for mathematical queries
   */
  override shouldActivate(input: string, _context: PluginContext): boolean {
    if (!this.enabled) {
      return false;
    }

    const inputLower = input.toLowerCase();

    // Direct math trigger words
    const hasMathTrigger = this.triggers.some(trigger => 
      inputLower.includes(trigger.toLowerCase())
    );

    if (hasMathTrigger) {
      return true;
    }

    // Pattern-based detection for mathematical expressions
    const mathPatterns = [
      /\d+\s*[\+\-\*\/\^]\s*\d+/,  // Basic arithmetic: 5 + 3, 10 * 2
      /\d+\s*\%/,                  // Percentages: 25%
      /\d+\s*\^\s*\d+/,           // Powers: 2^3
      /sqrt\s*\(\s*\d+\s*\)/i,    // Square root: sqrt(16)
      /sin\s*\(\s*\d+\s*\)/i,     // Trigonometry: sin(45)
      /cos\s*\(\s*\d+\s*\)/i,     // Trigonometry: cos(60)
      /tan\s*\(\s*\d+\s*\)/i,     // Trigonometry: tan(30)
      /log\s*\(\s*\d+\s*\)/i,     // Logarithm: log(100)
      /factorial\s*\(\s*\d+\s*\)/i, // Factorial: factorial(5)
      /\d+!\s*/,                   // Factorial shorthand: 5!
      /\d+\s*(to|in)\s*\w+/i      // Unit conversion: 5 meters to feet
    ];

    return mathPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Execute mathematical computation
   */
  async execute(input: string, context: PluginContext): Promise<PluginResult> {
    const startTime = Date.now();

    try {
      // Clean and prepare the mathematical expression
      const expression = this.cleanMathExpression(input);
      
      if (!expression) {
        return this.createErrorResult(
          'Please provide a valid mathematical expression (e.g., "calculate 5 + 3" or "what is sqrt(16)")',
          'INVALID_EXPRESSION',
          Date.now() - startTime
        );
      }

      // Determine the type of mathematical operation
      const operationType = this.determineOperationType(expression);

      // Evaluate the expression
      const result = await this.evaluateExpression(expression, operationType);

      // Format the response
      const formattedResponse = this.formatMathResponse(expression, result, operationType);

      this.logExecution(input, { success: true } as PluginResult, context);

      return this.createSuccessResult(
        {
          expression: expression,
          result: result,
          type: operationType,
          formatted_result: typeof result === 'number' ? this.formatNumber(result) : result
        },
        formattedResponse,
        Date.now() - startTime
      );

    } catch (error) {
      logger.error('Math plugin execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: context.session_id
      });

      return this.createErrorResult(
        'Failed to evaluate mathematical expression. Please check your syntax and try again.',
        'EVALUATION_ERROR',
        Date.now() - startTime
      );
    }
  }

  /**
   * Validate math plugin configuration
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

    try {
      // Test basic math functionality
      const testResult = this.mathjs.evaluate('2 + 2');
      if (testResult !== 4) {
        errors.push('Math evaluation engine not working correctly');
      }
    } catch (error) {
      errors.push('Math evaluation engine failed initialization');
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
   * Clean and extract mathematical expression from user input
   */
  private cleanMathExpression(input: string): string | null {
    // Remove common question words and phrases
    let cleaned = input
      .toLowerCase()
      .replace(/^(what is|how much is|calculate|compute|solve|what's)/i, '')
      .replace(/\?+$/, '')
      .trim();

    // Handle special patterns
    cleaned = cleaned
      .replace(/x/g, '*')  // Replace 'x' with '*' for multiplication
      .replace(/\btimes\b/g, '*')  // Replace 'times' with '*'
      .replace(/\bplus\b/g, '+')   // Replace 'plus' with '+'
      .replace(/\bminus\b/g, '-')  // Replace 'minus' with '-'
      .replace(/\bdivided by\b/g, '/') // Replace 'divided by' with '/'
      .replace(/\bto the power of\b/g, '^') // Replace 'to the power of' with '^'
      .replace(/\bsquared\b/g, '^2') // Replace 'squared' with '^2'
      .replace(/\bcubed\b/g, '^3');  // Replace 'cubed' with '^3'

    // Handle percentage calculations
    if (cleaned.includes('percent') || cleaned.includes('%')) {
      cleaned = this.handlePercentageExpression(cleaned);
    }

    // Validate that we have some mathematical content
    if (!/[\d\+\-\*\/\^\(\)\.]/.test(cleaned)) {
      return null;
    }

    return cleaned;
  }

  /**
   * Handle percentage expressions
   */
  private handlePercentageExpression(expression: string): string {
    // Convert "X percent of Y" to "(X/100) * Y"
    const percentOfPattern = /(\d+\.?\d*)\s*percent\s*of\s*(\d+\.?\d*)/i;
    const match = expression.match(percentOfPattern);
    
    if (match) {
      const percentage = match[1];
      const value = match[2];
      return `(${percentage}/100) * ${value}`;
    }

    // Convert "X%" to "X/100"
    return expression.replace(/(\d+\.?\d*)\s*%/g, '($1/100)');
  }

  /**
   * Determine the type of mathematical operation
   */
  private determineOperationType(expression: string): MathPlugin.OperationType {
    const expr = expression.toLowerCase();

    if (expr.includes('sin') || expr.includes('cos') || expr.includes('tan')) {
      return 'trigonometry';
    }
    
    if (expr.includes('log') || expr.includes('ln')) {
      return 'logarithmic';
    }
    
    if (expr.includes('sqrt') || expr.includes('^') || expr.includes('power')) {
      return 'exponential';
    }
    
    if (expr.includes('!') || expr.includes('factorial')) {
      return 'factorial';
    }
    
    if (expr.includes('to ') || expr.includes('in ')) {
      return 'unit_conversion';
    }
    
    if (expr.includes('percent') || expr.includes('%')) {
      return 'percentage';
    }
    
    if (/[\+\-\*\/]/.test(expr)) {
      return 'arithmetic';
    }

    return 'basic';
  }

  /**
   * Safely evaluate mathematical expression
   */
  private async evaluateExpression(
    expression: string, 
    operationType: MathPlugin.OperationType
  ): Promise<number | string> {
    try {
      // Handle unit conversions separately
      if (operationType === 'unit_conversion') {
        return this.handleUnitConversion(expression);
      }

      // Use mathjs for safe evaluation
      const result = this.mathjs.evaluate(expression);

      // Handle complex numbers, matrices, etc.
      if (typeof result === 'object') {
        if ('re' in result && 'im' in result) {
          // Complex number
          return `${result.re} + ${result.im}i`;
        }
        return result.toString();
      }

      return Number(result);

    } catch (error) {
      throw new Error(`Invalid mathematical expression: ${expression}`);
    }
  }

  /**
   * Handle unit conversion operations
   */
  private handleUnitConversion(expression: string): string {
    // Simple unit conversion patterns
    const conversionPatterns = [
      { pattern: /(\d+\.?\d*)\s*(meters?|m)\s*to\s*(feet|ft)/i, convert: (val: number) => val * 3.28084 },
      { pattern: /(\d+\.?\d*)\s*(feet|ft)\s*to\s*(meters?|m)/i, convert: (val: number) => val / 3.28084 },
      { pattern: /(\d+\.?\d*)\s*(celsius|c)\s*to\s*(fahrenheit|f)/i, convert: (val: number) => (val * 9/5) + 32 },
      { pattern: /(\d+\.?\d*)\s*(fahrenheit|f)\s*to\s*(celsius|c)/i, convert: (val: number) => (val - 32) * 5/9 },
      { pattern: /(\d+\.?\d*)\s*(kg|kilograms?)\s*to\s*(lbs?|pounds?)/i, convert: (val: number) => val * 2.20462 },
      { pattern: /(\d+\.?\d*)\s*(lbs?|pounds?)\s*to\s*(kg|kilograms?)/i, convert: (val: number) => val / 2.20462 }
    ];

    for (const { pattern, convert } of conversionPatterns) {
      const match = expression.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        const result = convert(value);
        return result.toString();
      }
    }

    throw new Error('Unsupported unit conversion');
  }

  /**
   * Format mathematical response for display
   */
  private formatMathResponse(
    expression: string, 
    result: number | string, 
    operationType: MathPlugin.OperationType
  ): string {
    const formattedResult = typeof result === 'number' ? this.formatNumber(result) : result;

    switch (operationType) {
      case 'arithmetic':
        return `📊 ${expression} = ${formattedResult}`;
      
      case 'percentage':
        return `📊 ${expression} = ${formattedResult}`;
      
      case 'trigonometry':
        return `📐 ${expression} = ${formattedResult}`;
      
      case 'logarithmic':
        return `📈 ${expression} = ${formattedResult}`;
      
      case 'exponential':
        return `⚡ ${expression} = ${formattedResult}`;
      
      case 'factorial':
        return `🔢 ${expression} = ${formattedResult}`;
      
      case 'unit_conversion':
        return `🔄 Conversion result: ${formattedResult}`;
      
      default:
        return `🔢 ${expression} = ${formattedResult}`;
    }
  }

  /**
   * Format numbers for better readability
   */
  private formatNumber(num: number): string {
    // Handle very large numbers
    if (Math.abs(num) >= 1e12) {
      return num.toExponential(3);
    }

    // Handle very small numbers
    if (Math.abs(num) < 1e-6 && num !== 0) {
      return num.toExponential(3);
    }

    // Round to reasonable precision
    const rounded = Math.round(num * 1e10) / 1e10;

    // Add commas for large numbers
    if (Math.abs(rounded) >= 1000) {
      return rounded.toLocaleString();
    }

    return rounded.toString();
  }
}
