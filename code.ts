// Simple Variable Swapper - Figma Plugin
// This plugin helps users swap variables on imported components
// to use local variables in their organization

// Show UI with size and theme
figma.showUI(__html__, { 
  width: 400, 
  height: 500, 
  themeColors: true 
});

// Type definitions for messages
type PluginMessage = { 
  type: string; 
  action?: string;
  variableMatches?: VariableMatch[];
};

type VariableMatch = {
  field: string;
  currentVariable: {
    id: string;
    name: string;
    type: string;
  } | null;
  localVariable: {
    id: string;
    name: string;
    type: string;
  } | null;
  nodeName: string;
  nodeType: string;
  variantName?: string;
  nodeId: string;
  // Text style matching
  currentTextStyle?: {
    id: string;
    name: string;
  } | null;
  localTextStyle?: {
    id: string;
    name: string;
  } | null;
};

// Main message handler
figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    if (msg.type === 'analyze-selection') {
      await analyzeSelection();
    } else if (msg.type === 'swap-variables') {
      await swapVariables(msg.variableMatches || []);
    } else if (msg.type === 'cancel') {
      figma.closePlugin();
    }
  } catch (error) {
    console.error('Plugin error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};

// Analyze selected component and find variable matches
async function analyzeSelection() {
  const selection = figma.currentPage.selection;
  
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Starter analyse av valgt node`);
  
  // Check that a component is selected
  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Please select a component first.'
    });
    return;
  }

  if (selection.length > 1) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Please select only one component.'
    });
    return;
  }

  const selectedNode = selection[0];
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Valgt node: ${selectedNode.name} (${selectedNode.type})`);
  
  // Check that it's a component, component-set or instance
  if (selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET' && selectedNode.type !== 'INSTANCE') {
    figma.ui.postMessage({
      type: 'error',
      message: 'The selected node must be a component, component-set or instance.'
    });
    return;
  }

  // Get all local variables
  const localVariables = await figma.variables.getLocalVariablesAsync();
  const localVariableMap = new Map();
  const localVariableIdSet = new Set<string>();
  
  localVariables.forEach(variable => {
    localVariableMap.set(variable.name, variable);
    localVariableIdSet.add(variable.id);
  });

  // Get all local text styles
  const localTextStyles = await figma.getLocalTextStylesAsync();
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant ${localVariables.length} lokale variabler og ${localTextStyles.length} lokale text styles`);

  // Analyze component for variables
  const variableMatches: VariableMatch[] = [];
  
  if (selectedNode.type === 'COMPONENT_SET') {
    // For ComponentSet, analyze all variants
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer ComponentSet med ${(selectedNode as ComponentSetNode).children.length} varianter`);
    await analyzeComponentSetForVariables(selectedNode as ComponentSetNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
  } else {
    // For single component or instance
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer enkelt komponent/instans`);
    await analyzeNodeForVariables(selectedNode as SceneNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
  }

  console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyse fullført. Totalt ${variableMatches.length} variabler funnet`);

  // Send result to UI
  const result: any = {
    type: 'analysis-complete',
    variableMatches: variableMatches,
    componentName: selectedNode.name,
    componentType: selectedNode.type
  };

  // Add variantCount for ComponentSet
  if (selectedNode.type === 'COMPONENT_SET') {
    result.variantCount = (selectedNode as ComponentSetNode).children.length;
  }

  figma.ui.postMessage(result);
}

// Analyze ComponentSet for variables (all variants)
async function analyzeComponentSetForVariables(
  componentSet: ComponentSetNode, 
  localVariableMap: Map<string, Variable>, 
  localVariableIdSet: Set<string>,
  localTextStyles: BaseStyle[],
  matches: VariableMatch[]
) {
  // Analyze each variant in ComponentSet
  for (const variant of componentSet.children) {
    if (variant.type === 'COMPONENT') {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer variant: ${variant.name}`);
      await analyzeNodeForVariables(variant, localVariableMap, localVariableIdSet, localTextStyles, matches, variant.name);
    }
  }
}

// Analyze text styles on text nodes
async function analyzeTextStyles(
  node: SceneNode,
  localTextStyles: BaseStyle[],
  matches: VariableMatch[],
  variantName?: string
) {
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    
    // Check if text node has textStyleId
    if (textNode.textStyleId && typeof textNode.textStyleId === 'string') {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har textStyleId: ${textNode.textStyleId}`);
      
      // Get current text style (may be from external library)
      const currentTextStyle = await figma.getStyleByIdAsync(textNode.textStyleId);
      
      if (currentTextStyle) {
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Nåværende text style: ${currentTextStyle.name} (${currentTextStyle.id})`);
        
        // Find local text style with same name
        const localTextStyle = localTextStyles.find(style => style.name === currentTextStyle.name);
        
        if (localTextStyle) {
          console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant lokal text style match: ${localTextStyle.name} (${localTextStyle.id})`);
          
          // Skip if already connected to local text style (same id)
          if (localTextStyle.id === textNode.textStyleId) {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] HOPPER OVER: Text style allerede koblet til lokal`);
            return;
          }
          
          matches.push({
            field: 'textStyleId',
            currentVariable: null,
            localVariable: null,
            nodeName: textNode.name,
            nodeType: textNode.type,
            variantName: variantName,
            nodeId: textNode.id,
            currentTextStyle: {
              id: textNode.textStyleId,
              name: currentTextStyle.name
            },
            localTextStyle: {
              id: localTextStyle.id,
              name: localTextStyle.name
            }
          });
        } else {
          console.log(`[VARIABLE_ANALYSIS_DEBUG] Ingen lokal text style match funnet for navn: ${currentTextStyle.name}`);
        }
      } else {
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Kunne ikke finne text style med ID: ${textNode.textStyleId}`);
      }
    } else {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har ingen textStyleId`);
    }
  }
}

// Analyze text variables on text nodes (only if no text style)
async function analyzeTextVariables(
  node: SceneNode,
  localVariableMap: Map<string, Variable>,
  localVariableIdSet: Set<string>,
  matches: VariableMatch[],
  variantName?: string
) {
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    
    // Only analyze text variables if no text style is set
    if (!textNode.textStyleId || textNode.textStyleId === '') {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har ingen text style, sjekker text variabler`);
      
      const textProperties = ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'];
      
      
      // Check boundVariables for typography variables (as shown in logs)
      if ('boundVariables' in textNode && textNode.boundVariables) {
        
        for (const prop of textProperties) {
          if (prop in textNode.boundVariables) {
            
            const boundVar = textNode.boundVariables[prop as keyof typeof textNode.boundVariables];
            if (Array.isArray(boundVar) && boundVar.length > 0) {
              const variableRef = boundVar[0];
              
              if (variableRef && typeof variableRef === 'object' && variableRef.type === 'VARIABLE_ALIAS') {
                console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant text variabel: ${prop} med ID: ${variableRef.id}`);
                
                const currentVariable = await figma.variables.getVariableByIdAsync(variableRef.id);
                
                if (currentVariable) {
                  // Skip if already connected to local variable (same id)
                  if (localVariableIdSet.has(currentVariable.id)) {
                    console.log(`[VARIABLE_ANALYSIS_DEBUG] HOPPER OVER: Text variabel ${currentVariable.name} er allerede lokal`);
                    continue;
                  }
                  
                  // Search for local variable with same name
                  const localVariable = localVariableMap.get(currentVariable.name);
                  
                  if (localVariable) {
                    console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant lokal match for text variabel: ${localVariable.name} (${localVariable.id})`);
                  } else {
                    console.log(`[VARIABLE_ANALYSIS_DEBUG] Ingen lokal match funnet for text variabel: ${currentVariable.name}`);
                  }
                  
                  matches.push({
                    field: prop,
                    currentVariable: {
                      id: currentVariable.id,
                      name: currentVariable.name,
                      type: currentVariable.resolvedType
                    },
                    localVariable: localVariable ? {
                      id: localVariable.id,
                      name: localVariable.name,
                      type: localVariable.resolvedType
                    } : null,
                    nodeName: textNode.name,
                    nodeType: textNode.type,
                    variantName: variantName,
                    nodeId: textNode.id
                  });
                }
              }
            }
          } else {
          }
        }
      } else {
      }
      
    } else {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har text style, hopper over text variabler`);
    }
  }
}

// Analyze color variables in fills and strokes
// Color variables can be bound in two ways:
// 1. Direct binding: boundVariables.fills[0] = {type: 'VARIABLE_ALIAS', id: '...'}
// 2. Indirect binding: fills[0].color = {type: 'VARIABLE_ALIAS', id: '...'}
async function analyzeColorVariables(
  node: SceneNode,
  localVariableMap: Map<string, Variable>,
  localVariableIdSet: Set<string>,
  matches: VariableMatch[],
  variantName?: string
) {
  // Check boundVariables for fills and strokes (direct binding)
  const hasDirectFillsBinding = 'boundVariables' in node && node.boundVariables && 
    'fills' in node.boundVariables && Array.isArray((node.boundVariables as any).fills);
  const hasDirectStrokesBinding = 'boundVariables' in node && node.boundVariables && 
    'strokes' in node.boundVariables && Array.isArray((node.boundVariables as any).strokes);

  if (hasDirectFillsBinding) {
    // Check fills (direct binding)
    const fillsRefs = (node.boundVariables as any).fills;
    for (let i = 0; i < fillsRefs.length; i++) {
      const fillRef = fillsRefs[i];
      if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && fillRef.type === 'VARIABLE_ALIAS') {
        const currentVariable = await figma.variables.getVariableByIdAsync(fillRef.id);
        
        if (currentVariable) {
          // Search for local variable with same name
          const localVariable = localVariableMap.get(currentVariable.name);
          
          // Skip if already connected to local variable (same id)
          if (localVariable && localVariable.id === currentVariable.id) continue;
          
          matches.push({
            field: `fills[${i}]`,
            currentVariable: {
              id: currentVariable.id,
              name: currentVariable.name,
              type: currentVariable.resolvedType
            },
            localVariable: localVariable ? {
              id: localVariable.id,
              name: localVariable.name,
              type: localVariable.resolvedType
            } : null,
            nodeName: node.name,
            nodeType: node.type,
            variantName: variantName,
            nodeId: node.id
          });
        }
      }
    }
  }

  if (hasDirectStrokesBinding) {
    // Check strokes (direct binding)
    const strokesRefs = (node.boundVariables as any).strokes;
    for (let i = 0; i < strokesRefs.length; i++) {
      const strokeRef = strokesRefs[i];
      if (strokeRef && typeof strokeRef === 'object' && 'type' in strokeRef && strokeRef.type === 'VARIABLE_ALIAS') {
        const currentVariable = await figma.variables.getVariableByIdAsync(strokeRef.id);
        
        if (currentVariable) {
          const localVariable = localVariableMap.get(currentVariable.name);
          
          // Skip if already connected to local variable (same id)
          if (localVariable && localVariable.id === currentVariable.id) continue;
          
          matches.push({
            field: `strokes[${i}]`,
            currentVariable: {
              id: currentVariable.id,
              name: currentVariable.name,
              type: currentVariable.resolvedType
            },
            localVariable: localVariable ? {
              id: localVariable.id,
              name: localVariable.name,
              type: localVariable.resolvedType
            } : null,
            nodeName: node.name,
            nodeType: node.type,
            variantName: variantName,
            nodeId: node.id
          });
        }
      }
    }
  }

  // Check color variables in paint objects (indirect binding) - only if no direct binding
  if (!hasDirectFillsBinding && 'fills' in node && Array.isArray(node.fills)) {
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i];
      if (fill && fill.type === 'SOLID' && 'color' in fill) {
        const colorValue = (fill as any).color;
        if (colorValue && typeof colorValue === 'object' && 'type' in colorValue && colorValue.type === 'VARIABLE_ALIAS') {
          const currentVariable = await figma.variables.getVariableByIdAsync(colorValue.id);
          
          if (currentVariable) {
            if (localVariableIdSet.has(currentVariable.id)) continue;
            const localVariable = localVariableMap.get(currentVariable.name);
            
            matches.push({
              field: `fills[${i}].color`,
              currentVariable: {
                id: currentVariable.id,
                name: currentVariable.name,
                type: currentVariable.resolvedType
              },
              localVariable: localVariable ? {
                id: localVariable.id,
                name: localVariable.name,
                type: localVariable.resolvedType
              } : null,
              nodeName: node.name,
              nodeType: node.type,
              variantName: variantName,
              nodeId: node.id
            });
          }
        }
      }
    }
  }

  // Check color variables in stroke objects (indirect binding) - only if no direct binding
  if (!hasDirectStrokesBinding && 'strokes' in node && Array.isArray(node.strokes)) {
    for (let i = 0; i < node.strokes.length; i++) {
      const stroke = node.strokes[i];
      if (stroke && stroke.type === 'SOLID' && 'color' in stroke) {
        const colorValue = (stroke as any).color;
        if (colorValue && typeof colorValue === 'object' && 'type' in colorValue && colorValue.type === 'VARIABLE_ALIAS') {
          const currentVariable = await figma.variables.getVariableByIdAsync(colorValue.id);
          
          if (currentVariable) {
            if (localVariableIdSet.has(currentVariable.id)) continue;
            const localVariable = localVariableMap.get(currentVariable.name);
            
            matches.push({
              field: `strokes[${i}].color`,
              currentVariable: {
                id: currentVariable.id,
                name: currentVariable.name,
                type: currentVariable.resolvedType
              },
              localVariable: localVariable ? {
                id: localVariable.id,
                name: localVariable.name,
                type: localVariable.resolvedType
              } : null,
              nodeName: node.name,
              nodeType: node.type,
              variantName: variantName,
              nodeId: node.id
            });
          }
        }
      }
    }
  }
}

// Recursively analyze node for variables
async function analyzeNodeForVariables(
  node: SceneNode, 
  localVariableMap: Map<string, Variable>, 
  localVariableIdSet: Set<string>,
  localTextStyles: BaseStyle[],
  matches: VariableMatch[],
  variantName?: string
) {
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer node: ${node.name} (${node.type})${variantName ? ` i variant: ${variantName}` : ''}`);
  
  // Analyze boundVariables
  if ('boundVariables' in node && node.boundVariables) {
    
    for (const [field, variableRef] of Object.entries(node.boundVariables)) {
      if (variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
        const currentVariable = await figma.variables.getVariableByIdAsync((variableRef as any).id);
        
        if (currentVariable) {
          console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant variabel: ${currentVariable.name} (${currentVariable.id}) på felt: ${field}`);
          
          // Skip if already local (id exists in locals)
          if (localVariableIdSet.has(currentVariable.id)) {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] HOPPER OVER: Variabel ${currentVariable.name} er allerede lokal`);
            continue;
          }
          
          // Search for local variable with same name
          const localVariable = localVariableMap.get(currentVariable.name);
          
          if (localVariable) {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant lokal match: ${localVariable.name} (${localVariable.id})`);
          } else {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Ingen lokal match funnet for: ${currentVariable.name}`);
          }
          
          matches.push({
            field: field,
            currentVariable: {
              id: currentVariable.id,
              name: currentVariable.name,
              type: currentVariable.resolvedType
            },
            localVariable: localVariable ? {
              id: localVariable.id,
              name: localVariable.name,
              type: localVariable.resolvedType
            } : null,
            nodeName: node.name,
            nodeType: node.type,
            variantName: variantName,
            nodeId: node.id
          });
        }
      }
    }
  }

  // Prioritize text styles over individual typography variables for better consistency
  // Text styles are more robust and provide better design system alignment
  await analyzeTextStyles(node, localTextStyles, matches, variantName);

  // Only analyze individual text variables if no text style is applied
  // This prevents conflicts between text styles and individual typography variables
  await analyzeTextVariables(node, localVariableMap, localVariableIdSet, matches, variantName);

  // Special handling for color variables in fills and strokes
  await analyzeColorVariables(node, localVariableMap, localVariableIdSet, matches, variantName);

  // Remove duplicates based on variable ID + node ID + field + variant combination
  // This prevents the same variable from being swapped multiple times on the same node
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Before deduplication: ${matches.length} matches`);
  const uniqueMatches: VariableMatch[] = [];
  const seenVariableIds = new Set<string>();
  
  for (const match of matches) {
    if (match.currentVariable) {
      const key = `${match.currentVariable.id}-${match.nodeId}-${match.field}-${match.variantName || 'default'}`;
      if (!seenVariableIds.has(key)) {
        seenVariableIds.add(key);
        uniqueMatches.push(match);
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Beholder match: ${match.currentVariable.name} på ${match.nodeName} (${match.variantName || 'default'}) - nodeId: ${match.nodeId}`);
      } else {
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Fjerner duplikat: ${match.currentVariable.name} på ${match.nodeName} (${match.variantName || 'default'}) - nodeId: ${match.nodeId}`);
      }
    } else {
      // If no currentVariable, add anyway
      uniqueMatches.push(match);
    }
  }
  
  console.log(`[VARIABLE_ANALYSIS_DEBUG] After deduplication: ${uniqueMatches.length} matches`);
  
  // Replace matches with deduplicated matches
  matches.length = 0;
  matches.push(...uniqueMatches);

  // Analyze children recursively
  if ('children' in node) {
    for (const child of node.children) {
      await analyzeNodeForVariables(child, localVariableMap, localVariableIdSet, localTextStyles, matches);
    }
  }
}

// Swap variables based on matches
async function swapVariables(variableMatches: VariableMatch[]) {
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  const errorGroups: Map<string, number> = new Map();

  console.log(`[VARIABLE_SWAP_DEBUG] Starter bytting av ${variableMatches.length} variabler`);

  for (const match of variableMatches) {
    console.log(`[VARIABLE_SWAP_DEBUG] Behandler match: ${match.field} på ${match.nodeName}`);
    
    // Handle text styles
    if (match.field === 'textStyleId' && match.localTextStyle) {
      try {
        // Find the node that has this text style
        console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med ID: ${match.nodeId}`);
        const node = await figma.getNodeByIdAsync(match.nodeId) as SceneNode;
        
        if (!node) {
          errorCount++;
          const errorMsg = `Could not find node with ID: ${match.nodeId} for text style: ${match.localTextStyle.name}`;
          errors.push(errorMsg);
          console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
          continue;
        }
        
        if (node.type !== 'TEXT') {
          errorCount++;
          const errorMsg = `Node ${node.name} is not a TEXT-node (type: ${node.type}) for text style: ${match.localTextStyle.name}`;
          errors.push(errorMsg);
          console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
          continue;
        }

        const textNode = node as TextNode;
        console.log(`[VARIABLE_SWAP_DEBUG] Fant TEXT-node: ${textNode.name}`);

        // Bytt text style
        console.log(`[VARIABLE_SWAP_DEBUG] Bytter text style til: ${match.localTextStyle.name} (${match.localTextStyle.id})`);
        await textNode.setTextStyleIdAsync(match.localTextStyle.id);
        
        successCount++;
        console.log(`[VARIABLE_SWAP_DEBUG] SUKSESS: Text style byttet til ${match.localTextStyle.name}`);
        continue;

      } catch (error) {
        errorCount++;
        const errorMsg = `Error swapping text style ${match.localTextStyle?.name}: ${error}`;
        errors.push(errorMsg);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        continue;
      }
    }
    
    // Handle regular variables
    if (!match.localVariable) {
      errorCount++;
      const errorMsg = `No local variable found for: ${match.currentVariable?.name}`;
      errors.push(errorMsg);
      console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
      continue;
    }

    try {
      // Find the node that has this variable
      let node: SceneNode | null = null;
      
      // For text variables, use nodeId directly
      if (match.nodeId && (match.field === 'fontSize' || match.field === 'fontFamily' || match.field === 'fontStyle' || match.field === 'fontWeight' || match.field === 'lineHeight' || match.field === 'letterSpacing' || match.field === 'textCase' || match.field === 'textDecoration')) {
        console.log(`[VARIABLE_SWAP_DEBUG] Text variabel - bruker nodeId: ${match.nodeId}`);
        node = await figma.getNodeByIdAsync(match.nodeId) as SceneNode;
      } else {
        console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med variabel ID: ${match.currentVariable?.id}`);
        node = await findNodeWithVariable(match.currentVariable?.id || '');
      }
      
      if (!node) {
        errorCount++;
        const errorMsg = `Could not find node for variable: ${match.currentVariable?.name}`;
        errors.push(errorMsg);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        continue;
      }

      console.log(`[VARIABLE_SWAP_DEBUG] Fant node: ${node.name} (${node.type})`);

      // Get the local variable
      const localVariable = await figma.variables.getVariableByIdAsync(match.localVariable.id);
      
      if (!localVariable) {
        errorCount++;
        const errorMsg = `Could not retrieve local variable: ${match.localVariable.name}`;
        errors.push(errorMsg);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        continue;
      }

      console.log(`[VARIABLE_SWAP_DEBUG] Lokal variabel: ${localVariable.name} (${localVariable.id})`);

      // Skip if already same id (already connected to local variable)
      if (match.currentVariable && localVariable.id === match.currentVariable.id) {
        console.log(`[VARIABLE_SWAP_DEBUG] HOPPER OVER: Variabel allerede koblet til lokal (samme ID)`);
        continue;
      }

      // Check if variable is actually connected to node before swapping
      console.log(`[VARIABLE_SWAP_DEBUG] Sjekker om variabel er koblet til node...`);
      const isCurrentlyBound = await checkIfVariableIsBoundToNode(node, match.currentVariable?.id || '', match.field);
      console.log(`[VARIABLE_SWAP_DEBUG] Variabel koblet til node: ${isCurrentlyBound}`);

      if (!isCurrentlyBound) {
        console.log(`[VARIABLE_SWAP_DEBUG] ADVARSEL: Variabel ${match.currentVariable?.name} er ikke lenger koblet til node ${node.name}`);
      }

      // Swap the variable
      console.log(`[VARIABLE_SWAP_DEBUG] Bytter variabel på node...`);
      await swapVariableOnNode(node, match.field, localVariable);
      
      // Verify that the swap actually happened
      console.log(`[VARIABLE_SWAP_DEBUG] Verifiserer bytting...`);
      const isNowBound = await checkIfVariableIsBoundToNode(node, localVariable.id, match.field);
      console.log(`[VARIABLE_SWAP_DEBUG] Ny variabel koblet til node: ${isNowBound}`);
      
      if (isNowBound) {
        successCount++;
        console.log(`[VARIABLE_SWAP_DEBUG] SUKSESS: Variabel byttet fra ${match.currentVariable?.name} til ${localVariable.name}`);
      } else {
        errorCount++;
        // Diagnose common causes - especially instances where variable cannot be overridden
        let reason = 'Variable was not connected to node';
        if (node.type === 'INSTANCE') {
          reason = 'Variable cannot be overridden in instance (not exposed)';
        }
        const errorMsg = `Swapping failed for ${match.currentVariable?.name} on ${node.name}: ${reason}`;
        errors.push(errorMsg);
        errorGroups.set(errorMsg, (errorGroups.get(errorMsg) || 0) + 1);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
      }

    } catch (error) {
      errorCount++;
      const errorMsg = `Error swapping ${match.currentVariable?.name}: ${error}`;
      errors.push(errorMsg);
      errorGroups.set(errorMsg, (errorGroups.get(errorMsg) || 0) + 1);
      console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
    }
  }

  console.log(`[VARIABLE_SWAP_DEBUG] Bytting fullført: ${successCount} suksess, ${errorCount} feil`);

  // Send result to UI
  figma.ui.postMessage({
    type: 'swap-complete',
    successCount: successCount,
    errorCount: errorCount,
    errors: errors,
    errorGroups: Array.from(errorGroups.entries()).map(([message, count]) => ({ message, count }))
  });
}

// Find node that has a specific variable or nodeId
async function findNodeWithVariable(variableIdOrNodeId: string): Promise<SceneNode | null> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;

  const selectedNode = selection[0];
  
  // If it's a nodeId (starts with "I:" or similar), search directly for node
  if (variableIdOrNodeId.startsWith('I:') || variableIdOrNodeId.startsWith('V:')) {
    return findNodeByIdRecursive(selectedNode as SceneNode, variableIdOrNodeId);
  }
  
  if (selectedNode.type === 'COMPONENT_SET') {
    // For ComponentSet, search in all variants
    return findNodeWithVariableInComponentSet(selectedNode as ComponentSetNode, variableIdOrNodeId);
  } else {
    // For single component or instance
    return findNodeWithVariableRecursive(selectedNode as SceneNode, variableIdOrNodeId);
  }
}

// Search for node with variable in ComponentSet
function findNodeWithVariableInComponentSet(componentSet: ComponentSetNode, variableId: string): SceneNode | null {
  // Search in all variants
  for (const variant of componentSet.children) {
    if (variant.type === 'COMPONENT') {
      const found = findNodeWithVariableRecursive(variant, variableId);
      if (found) return found;
    }
  }
  return null;
}

// Search for node based on nodeId
function findNodeByIdRecursive(node: SceneNode, nodeId: string): SceneNode | null {
  console.log(`[VARIABLE_SWAP_DEBUG] Søker i node: ${node.name} (${node.id}) for ID: ${nodeId}`);
  
  // Check if this node has the correct ID
  if (node.id === nodeId) {
    console.log(`[VARIABLE_SWAP_DEBUG] Fant node: ${node.name} (${node.id})`);
    return node;
  }

  // Search in children
  if ('children' in node) {
    for (const child of node.children) {
      const found = findNodeByIdRecursive(child, nodeId);
      if (found) return found;
    }
  }

  return null;
}

// Recursive search for node with variable
function findNodeWithVariableRecursive(node: SceneNode, variableId: string): SceneNode | null {
  // Check if this node has the variable
  if ('boundVariables' in node && node.boundVariables) {
    for (const variableRef of Object.values(node.boundVariables)) {
      if (variableRef && typeof variableRef === 'object' && 'id' in variableRef && variableRef.id === variableId) {
        return node;
      }
    }
  }

  // Check color variables in fills and strokes
  if (hasColorVariable(node, variableId)) {
    return node;
  }

  // Search in children
  if ('children' in node) {
    for (const child of node.children) {
      const found = findNodeWithVariableRecursive(child, variableId);
      if (found) return found;
    }
  }

  return null;
}

// Helper function to check if a variable is bound to a node
// This function handles different binding patterns and field types
async function checkIfVariableIsBoundToNode(node: SceneNode, variableId: string, field: string): Promise<boolean> {
  // Check boundVariables directly
  if ('boundVariables' in node && node.boundVariables) {
    // Special handling for text variables (stored as arrays)
    if (['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'].includes(field)) {
      if (field in node.boundVariables) {
        const boundVar = node.boundVariables[field as keyof typeof node.boundVariables];
        if (Array.isArray(boundVar) && boundVar.length > 0) {
          const variableRef = boundVar[0];
          if (variableRef && typeof variableRef === 'object' && variableRef.type === 'VARIABLE_ALIAS' && variableRef.id === variableId) {
            return true;
          }
        }
      }
    } else {
      // For other variables, check directly
      for (const [boundField, variableRef] of Object.entries(node.boundVariables)) {
        if (boundField === field && variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
          if ((variableRef as any).id === variableId) {
            return true;
          }
        }
      }
    }
  }

  // Special check for color variables
  if (field.startsWith('fills[') || field.startsWith('strokes[')) {
    return hasColorVariable(node, variableId);
  }

  return false;
}

// Helper function to check if node has color variable
// Handles both direct and indirect color variable binding patterns
function hasColorVariable(node: SceneNode, variableId: string): boolean {
  // Check boundVariables for fills and strokes (direct binding)
  if ('boundVariables' in node && node.boundVariables) {
    // Check fills
    if ('fills' in node.boundVariables && Array.isArray((node.boundVariables as any).fills)) {
      const fillsRefs = (node.boundVariables as any).fills;
      for (const fillRef of fillsRefs) {
        if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && 
            fillRef.type === 'VARIABLE_ALIAS' && fillRef.id === variableId) {
          return true;
        }
      }
    }

    // Check strokes
    if ('strokes' in node.boundVariables && Array.isArray((node.boundVariables as any).strokes)) {
      const strokesRefs = (node.boundVariables as any).strokes;
      for (const strokeRef of strokesRefs) {
        if (strokeRef && typeof strokeRef === 'object' && 'type' in strokeRef && 
            strokeRef.type === 'VARIABLE_ALIAS' && strokeRef.id === variableId) {
          return true;
        }
      }
    }
  }

  // Check color variables in paint objects (indirect binding)
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill && fill.type === 'SOLID' && 'color' in fill) {
        const colorValue = (fill as any).color;
        if (colorValue && typeof colorValue === 'object' && 'type' in colorValue && 
            colorValue.type === 'VARIABLE_ALIAS' && colorValue.id === variableId) {
          return true;
        }
      }
    }
  }

  // Check color variables in stroke objects (indirect binding)
  if ('strokes' in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke && stroke.type === 'SOLID' && 'color' in stroke) {
        const colorValue = (stroke as any).color;
        if (colorValue && typeof colorValue === 'object' && 'type' in colorValue && 
            colorValue.type === 'VARIABLE_ALIAS' && colorValue.id === variableId) {
          return true;
        }
      }
    }
  }

  return false;
}

// Swap variable on a node with comprehensive field type handling
// This function handles different binding patterns for various property types
async function swapVariableOnNode(node: SceneNode, field: string, newVariable: Variable) {
  console.log(`[VARIABLE_SWAP_DEBUG] swapVariableOnNode: ${node.name}, field: ${field}, new variable: ${newVariable.name}`);
  
  if (!('boundVariables' in node)) {
    throw new Error('Node does not support variable binding');
  }

  // Handle different field types with specific binding patterns
  if (field === 'fills' || field === 'strokes') {
    console.log(`[VARIABLE_SWAP_DEBUG] Handling ${field} array`);
    // For fills and strokes we need to handle paint objects
    // Type casting required because Figma API doesn't expose fills/strokes on all node types
    const paints = field === 'fills' ? (node as any).fills : (node as any).strokes;
    
    if (Array.isArray(paints)) {
      console.log(`[VARIABLE_SWAP_DEBUG] ${field} array has ${paints.length} elements`);
      // Create a copy of the paints array before modification
      const paintsCopy = [...paints];
      for (let i = 0; i < paintsCopy.length; i++) {
        const paint = paintsCopy[i];
        if (paint && paint.type === 'SOLID') {
          console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on ${field}[${i}]`);
          // Set variable on the color property of the paint
          const newPaint = figma.variables.setBoundVariableForPaint(paint, 'color', newVariable);
          paintsCopy[i] = newPaint;
        }
      }
      
      if (field === 'fills') {
        // Type casting required for fills assignment
        (node as any).fills = paintsCopy;
      } else {
        // Type casting required for strokes assignment
        (node as any).strokes = paintsCopy;
      }
      console.log(`[VARIABLE_SWAP_DEBUG] ${field} array updated`);
    }
  } else if (field.startsWith('fills[') && field.endsWith(']')) {
    // Handle color variables in fills (direct binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Handling direct fills binding: ${field}`);
    const indexMatch = field.match(/fills\[(\d+)\]/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      // Type casting required for fills access
      const fills = (node as any).fills;
      if (Array.isArray(fills) && fills[index]) {
        console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on fills[${index}]`);
        // Create a copy of the fills array before modification
        const fillsCopy = [...fills];
        // For direct binding, replace the entire fill object
        const newFill = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
        fillsCopy[index] = newFill;
        // Set the new array
        // Type casting required for fills assignment
        (node as any).fills = fillsCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}] updated`);
      }
    }
  } else if (field.startsWith('strokes[') && field.endsWith(']')) {
    // Handle color variables in strokes (direct binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Handling direct strokes binding: ${field}`);
    const indexMatch = field.match(/strokes\[(\d+)\]/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      // Type casting required for strokes access
      const strokes = (node as any).strokes;
      if (Array.isArray(strokes) && strokes[index]) {
        console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on strokes[${index}]`);
        // Create a copy of the strokes array before modification
        const strokesCopy = [...strokes];
        // For direct binding, replace the entire stroke object
        const newStroke = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
        strokesCopy[index] = newStroke;
        // Set the new array
        // Type casting required for strokes assignment
        (node as any).strokes = strokesCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}] updated`);
      }
    }
  } else if (field.startsWith('fills[') && field.endsWith('].color')) {
    // Handle specific color variables in fills (indirect binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Handling indirect fills binding: ${field}`);
    const indexMatch = field.match(/fills\[(\d+)\]\.color/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      // Type casting required for fills access
      const fills = (node as any).fills;
      if (Array.isArray(fills) && fills[index] && fills[index].type === 'SOLID') {
        console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on fills[${index}].color`);
        // Create a copy of the fills array before modification
        const fillsCopy = [...fills];
        const newPaint = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
        fillsCopy[index] = newPaint;
        // Set the new array
        // Type casting required for fills assignment
        (node as any).fills = fillsCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}].color updated`);
      }
    }
  } else if (field.startsWith('strokes[') && field.endsWith('].color')) {
    // Handle specific color variables in strokes (indirect binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Handling indirect strokes binding: ${field}`);
    const indexMatch = field.match(/strokes\[(\d+)\]\.color/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      // Type casting required for strokes access
      const strokes = (node as any).strokes;
      if (Array.isArray(strokes) && strokes[index] && strokes[index].type === 'SOLID') {
        console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on strokes[${index}].color`);
        // Create a copy of the strokes array before modification
        const strokesCopy = [...strokes];
        const newPaint = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
        strokesCopy[index] = newPaint;
        // Set the new array
        // Type casting required for strokes assignment
        (node as any).strokes = strokesCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}].color updated`);
      }
    }
  } else if (node.type === 'TEXT' && ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'].includes(field)) {
    // Handle text variables on TEXT nodes
    console.log(`[VARIABLE_SWAP_DEBUG] Handling text variable: ${field} on TEXT node`);
    const textNode = node as TextNode;
    
    // Load font before modification (required for text variable binding)
    try {
      if (textNode.fontName === figma.mixed) {
        console.warn(`[VARIABLE_SWAP_DEBUG] Text has mixed fonts, cannot load font for ${field}`);
      } else {
        console.log(`[VARIABLE_SWAP_DEBUG] Loading font for ${field}: ${textNode.fontName.family} ${textNode.fontName.style}`);
        await figma.loadFontAsync(textNode.fontName);
        console.log(`[VARIABLE_SWAP_DEBUG] Font loaded for ${field}`);
      }
      
      // Use setBoundVariable for text variables (not direct assignment)
      console.log(`[VARIABLE_SWAP_DEBUG] Using setBoundVariable for text variable: ${field}`);
      textNode.setBoundVariable(field as VariableBindableNodeField, newVariable);
      console.log(`[VARIABLE_SWAP_DEBUG] Text variable ${field} set to: ${newVariable.name}`);
    } catch (fontError) {
      console.warn(`[VARIABLE_SWAP_DEBUG] Could not load font for ${field} on ${textNode.name}:`, fontError);
      // Try to set variable anyway
      console.log(`[VARIABLE_SWAP_DEBUG] Using setBoundVariable for text variable: ${field} (without font-loading)`);
      textNode.setBoundVariable(field as VariableBindableNodeField, newVariable);
      console.log(`[VARIABLE_SWAP_DEBUG] Text variable ${field} set to: ${newVariable.name} (without font-loading)`);
    }
  } else {
    // For other field types, use setBoundVariable
    console.log(`[VARIABLE_SWAP_DEBUG] Using setBoundVariable for field: ${field}`);
    node.setBoundVariable(field as VariableBindableNodeField, newVariable);
    console.log(`[VARIABLE_SWAP_DEBUG] setBoundVariable completed for ${field}`);
  }
}
