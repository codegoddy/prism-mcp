import type { ToolResponse } from '../types/mcp.js';
import { ParserFactory } from '../parsers/factory.js';
import { ParserError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { buildSymbolTable, findSymbolDefinition, findReferences } from './find_callers.js';
import type { SymbolDefinition, SymbolReference, RefactorImpact } from '../types/ast.js';
import { findSourceFiles } from './find_callers.js';

export async function analyzeRefactorImpact(args: Record<string, unknown>): Promise<ToolResponse> {
  const { filePath, elementName, elementType, proposedChanges } = args;

  if (typeof filePath !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: filePath must be a string',
        },
      ],
      isError: true,
    };
  }

  if (typeof elementName !== 'string') {
    return {
      content: [
        {
          type: 'text',
          text: 'Invalid arguments: elementName must be a string',
        },
      ],
      isError: true,
    };
  }

  try {
    logger.info('Analyzing refactor impact', {
      filePath,
      elementName,
      elementType,
      proposedChanges,
    });

    const parser = ParserFactory.getParserForFile(filePath);
    await parser.parseFile(filePath); // Ensure parser is initialized

    // Build symbol table and find the target element
    const projectDir = filePath.split('/').slice(0, -1).join('/') || '.';
    const files = findSourceFiles(projectDir);
    const symbolTable = await buildSymbolTable(files);

    const isMethod = elementType === 'method';
    const symbolDefinition = findSymbolDefinition(symbolTable, filePath, elementName, isMethod);

    if (!symbolDefinition) {
      return {
        content: [
          {
            type: 'text',
            text: `Element "${elementName}" not found in ${filePath}`,
          },
        ],
        isError: true,
      };
    }

    // Find all references to this element
    const references = await findAllReferences(symbolDefinition, files);

    // Analyze the impact based on proposed changes
    const impact = analyzeImpact(symbolDefinition, references, proposedChanges as any);

    const response: RefactorImpact = {
      targetElement: {
        name: elementName,
        type: symbolDefinition.type,
        filePath: symbolDefinition.filePath,
        line: symbolDefinition.startPosition.row + 1,
      },
      proposedChanges: proposedChanges as any,
      affectedLocations: impact.affectedLocations,
      breakingChanges: impact.breakingChanges,
      suggestedUpdates: impact.suggestedUpdates,
      riskLevel: impact.riskLevel,
      totalReferences: references.length,
    };

    logger.info('Refactor impact analysis completed', {
      elementName,
      references: references.length,
      breakingChanges: impact.breakingChanges.length,
      riskLevel: impact.riskLevel,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    logger.error('Failed to analyze refactor impact', error as Error, { filePath, elementName });

    if (error instanceof ParserError) {
      return {
        content: [{ type: 'text', text: error.message }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function findAllReferences(
  symbol: SymbolDefinition,
  files: string[]
): Promise<SymbolReference[]> {
  const allReferences: SymbolReference[] = [];

  for (const file of files) {
    try {
      const parser = ParserFactory.getParserForFile(file);
      const result = await parser.parseFile(file);
      const references = findReferences(result.tree, file, symbol);
      allReferences.push(...references);
    } catch (error) {
      logger.warn(`Failed to find references in ${file}`, error as Record<string, unknown>);
    }
  }

  return allReferences;
}

function analyzeImpact(
  _symbol: SymbolDefinition,
  references: SymbolReference[],
  proposedChanges: {
    parameterChanges?: Array<{
      name: string;
      oldType?: string;
      newType?: string;
      removed?: boolean;
      added?: boolean;
    }>;
    returnTypeChange?: {
      oldType: string;
      newType: string;
    };
    rename?: {
      oldName: string;
      newName: string;
    };
  }
): {
  affectedLocations: Array<{
    filePath: string;
    line: number;
    column: number;
    context: string;
    requiredChanges: string[];
  }>;
  breakingChanges: string[];
  suggestedUpdates: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
} {
  const affectedLocations: Array<{
    filePath: string;
    line: number;
    column: number;
    context: string;
    requiredChanges: string[];
  }> = [];

  const breakingChanges: string[] = [];
  const suggestedUpdates: string[] = [];

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Analyze parameter changes
  if (proposedChanges.parameterChanges) {
    for (const paramChange of proposedChanges.parameterChanges) {
      if (paramChange.removed) {
        breakingChanges.push(
          `Parameter "${paramChange.name}" removed - all callers must be updated`
        );
        riskLevel = 'critical';
      } else if (paramChange.added) {
        // New parameters - check if they have defaults
        breakingChanges.push(
          `Parameter "${paramChange.name}" added - callers may need to provide value`
        );
        if (riskLevel !== 'critical') riskLevel = 'high';
      } else if (paramChange.oldType !== paramChange.newType) {
        breakingChanges.push(
          `Parameter "${paramChange.name}" type changed from ${paramChange.oldType} to ${paramChange.newType}`
        );
        if (riskLevel !== 'critical') riskLevel = 'high';
      }
    }
  }

  // Analyze return type changes
  if (proposedChanges.returnTypeChange) {
    const { oldType, newType } = proposedChanges.returnTypeChange;
    breakingChanges.push(
      `Return type changed from ${oldType} to ${newType} - callers expecting ${oldType} will break`
    );

    if (oldType.includes('Promise') && !newType.includes('Promise')) {
      breakingChanges.push(
        'Return type changed from Promise to non-Promise - callers using await will break'
      );
      riskLevel = 'critical';
    } else if (!oldType.includes('Promise') && newType.includes('Promise')) {
      breakingChanges.push(
        'Return type changed from non-Promise to Promise - callers not using await will break'
      );
      if (riskLevel !== 'critical') riskLevel = 'high';
    } else {
      if (riskLevel !== 'critical') riskLevel = 'medium';
    }
  }

  // Analyze rename
  if (proposedChanges.rename) {
    breakingChanges.push(
      `Function renamed from "${proposedChanges.rename.oldName}" to "${proposedChanges.rename.newName}"`
    );
    suggestedUpdates.push(
      `Update all call sites to use new name "${proposedChanges.rename.newName}"`
    );
    riskLevel = 'critical';
  }

  // Analyze each reference location
  for (const ref of references) {
    const requiredChanges: string[] = [];

    if (proposedChanges.parameterChanges) {
      for (const paramChange of proposedChanges.parameterChanges) {
        if (paramChange.removed) {
          requiredChanges.push(`Remove argument for parameter "${paramChange.name}"`);
        } else if (paramChange.added) {
          requiredChanges.push(`Add argument for new parameter "${paramChange.name}"`);
        } else if (paramChange.oldType !== paramChange.newType) {
          requiredChanges.push(
            `Update argument type for parameter "${paramChange.name}" from ${paramChange.oldType} to ${paramChange.newType}`
          );
        }
      }
    }

    if (proposedChanges.returnTypeChange) {
      const { oldType, newType } = proposedChanges.returnTypeChange;
      if (oldType.includes('Promise') && !newType.includes('Promise')) {
        requiredChanges.push('Remove await keyword if present');
      } else if (!oldType.includes('Promise') && newType.includes('Promise')) {
        requiredChanges.push('Add await keyword or handle Promise');
      } else {
        requiredChanges.push(`Update code to handle new return type ${newType}`);
      }
    }

    if (proposedChanges.rename) {
      requiredChanges.push(
        `Change function call from "${proposedChanges.rename.oldName}" to "${proposedChanges.rename.newName}"`
      );
    }

    affectedLocations.push({
      filePath: ref.filePath,
      line: ref.startPosition.row + 1,
      column: ref.startPosition.column,
      context: ref.context.parentFunction || 'global scope',
      requiredChanges,
    });
  }

  // Generate suggested updates based on the analysis
  if (breakingChanges.length > 0) {
    suggestedUpdates.push('Test all affected locations after making changes');
    suggestedUpdates.push('Consider backward compatibility or migration strategy');
  }

  if (riskLevel === 'critical') {
    suggestedUpdates.push(
      '⚠️  HIGH RISK: This refactor will break existing code. Consider gradual migration.'
    );
  } else if (riskLevel === 'high') {
    suggestedUpdates.push('⚠️  Consider testing thoroughly and providing clear migration guide.');
  }

  return {
    affectedLocations,
    breakingChanges,
    suggestedUpdates,
    riskLevel,
  };
}

export default analyzeRefactorImpact;
