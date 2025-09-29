// Simple Variable Swapper - Figma Plugin
// Denne pluginen hjelper brukere med å bytte variabler på importerte komponenter
// til å bruke lokale variabler i deres organisasjon

// Vis UI med størrelse og tema
figma.showUI(__html__, { 
  width: 400, 
  height: 500, 
  themeColors: true 
});

// Type definisjoner for meldinger
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

// Hovedmelding-håndterer
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
      message: `Feil: ${error instanceof Error ? error.message : 'Ukjent feil'}`
    });
  }
};

// Analyser valgt komponent og finn variabel-matches
async function analyzeSelection() {
  const selection = figma.currentPage.selection;
  
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Starter analyse av valgt node`);
  
  // Sjekk at en komponent er valgt
  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Vennligst velg en komponent først.'
    });
    return;
  }

  if (selection.length > 1) {
    figma.ui.postMessage({
      type: 'error',
      message: 'Vennligst velg kun én komponent.'
    });
    return;
  }

  const selectedNode = selection[0];
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Valgt node: ${selectedNode.name} (${selectedNode.type})`);
  
  // Sjekk at det er en komponent, komponent-set eller instans
  if (selectedNode.type !== 'COMPONENT' && selectedNode.type !== 'COMPONENT_SET' && selectedNode.type !== 'INSTANCE') {
    figma.ui.postMessage({
      type: 'error',
      message: 'Den valgte noden må være en komponent, komponent-set eller instans.'
    });
    return;
  }

  // Hent alle lokale variabler
  const localVariables = await figma.variables.getLocalVariablesAsync();
  const localVariableMap = new Map();
  const localVariableIdSet = new Set<string>();
  
  localVariables.forEach(variable => {
    localVariableMap.set(variable.name, variable);
    localVariableIdSet.add(variable.id);
  });

  // Hent alle lokale text styles
  const localTextStyles = await figma.getLocalTextStylesAsync();
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant ${localVariables.length} lokale variabler og ${localTextStyles.length} lokale text styles`);

  // Analyser komponenten for variabler
  const variableMatches: VariableMatch[] = [];
  
  if (selectedNode.type === 'COMPONENT_SET') {
    // For ComponentSet, analyser alle varianter
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer ComponentSet med ${(selectedNode as ComponentSetNode).children.length} varianter`);
    await analyzeComponentSetForVariables(selectedNode as ComponentSetNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
  } else {
    // For enkelt komponent eller instans
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer enkelt komponent/instans`);
    await analyzeNodeForVariables(selectedNode as SceneNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
  }

  console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyse fullført. Totalt ${variableMatches.length} variabler funnet`);

  // Send resultat til UI
  const result: any = {
    type: 'analysis-complete',
    variableMatches: variableMatches,
    componentName: selectedNode.name,
    componentType: selectedNode.type
  };

  // Legg til variantCount for ComponentSet
  if (selectedNode.type === 'COMPONENT_SET') {
    result.variantCount = (selectedNode as ComponentSetNode).children.length;
  }

  figma.ui.postMessage(result);
}

// Analyser ComponentSet for variabler (alle varianter)
async function analyzeComponentSetForVariables(
  componentSet: ComponentSetNode, 
  localVariableMap: Map<string, Variable>, 
  localVariableIdSet: Set<string>,
  localTextStyles: BaseStyle[],
  matches: VariableMatch[]
) {
  // Analyser hver variant i ComponentSet
  for (const variant of componentSet.children) {
    if (variant.type === 'COMPONENT') {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer variant: ${variant.name}`);
      await analyzeNodeForVariables(variant, localVariableMap, localVariableIdSet, localTextStyles, matches, variant.name);
    }
  }
}

// Analyser text styles på tekstnoder
async function analyzeTextStyles(
  node: SceneNode,
  localTextStyles: BaseStyle[],
  matches: VariableMatch[],
  variantName?: string
) {
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    
    // Sjekk om tekstnode har textStyleId
    if (textNode.textStyleId && typeof textNode.textStyleId === 'string') {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har textStyleId: ${textNode.textStyleId}`);
      
      // Hent nåværende text style (kan være fra eksternt bibliotek)
      const currentTextStyle = await figma.getStyleByIdAsync(textNode.textStyleId);
      
      if (currentTextStyle) {
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Nåværende text style: ${currentTextStyle.name} (${currentTextStyle.id})`);
        
        // Finn lokal text style med samme navn
        const localTextStyle = localTextStyles.find(style => style.name === currentTextStyle.name);
        
        if (localTextStyle) {
          console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant lokal text style match: ${localTextStyle.name} (${localTextStyle.id})`);
          
          // Hopp over hvis allerede koblet til lokal text style (samme id)
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

// Analyser text variabler på tekstnoder (kun hvis ingen text style)
async function analyzeTextVariables(
  node: SceneNode,
  localVariableMap: Map<string, Variable>,
  localVariableIdSet: Set<string>,
  matches: VariableMatch[],
  variantName?: string
) {
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    
    // Kun analyser text variabler hvis ingen text style er satt
    if (!textNode.textStyleId || textNode.textStyleId === '') {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har ingen text style, sjekker text variabler`);
      
      const textProperties = ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'];
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Sjekker ${textProperties.length} text properties på ${textNode.name}`);
      
      // Debug: Vis alle properties på textNode
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Alle properties på textNode:`, Object.keys(textNode));
      console.log(`[VARIABLE_ANALYSIS_DEBUG] textNode.boundVariables:`, textNode.boundVariables);
      
      // Sjekk boundVariables for typography variabler (som loggen viser)
      if ('boundVariables' in textNode && textNode.boundVariables) {
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Sjekker boundVariables for typography variabler`);
        
        for (const prop of textProperties) {
          console.log(`[VARIABLE_ANALYSIS_DEBUG] Sjekker boundVariables.${prop}`);
          if (prop in textNode.boundVariables) {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] boundVariables.${prop} finnes:`, textNode.boundVariables[prop as keyof typeof textNode.boundVariables]);
            
            const boundVar = textNode.boundVariables[prop as keyof typeof textNode.boundVariables];
            if (Array.isArray(boundVar) && boundVar.length > 0) {
              const variableRef = boundVar[0];
              console.log(`[VARIABLE_ANALYSIS_DEBUG] Variable ref for ${prop}:`, variableRef);
              
              if (variableRef && typeof variableRef === 'object' && variableRef.type === 'VARIABLE_ALIAS') {
                console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant text variabel: ${prop} med ID: ${variableRef.id}`);
                
                const currentVariable = await figma.variables.getVariableByIdAsync(variableRef.id);
                
                if (currentVariable) {
                  // Hopp over hvis allerede koblet til lokal variabel (samme id)
                  if (localVariableIdSet.has(currentVariable.id)) {
                    console.log(`[VARIABLE_ANALYSIS_DEBUG] HOPPER OVER: Text variabel ${currentVariable.name} er allerede lokal`);
                    continue;
                  }
                  
                  // Søk etter lokal variabel med samme navn
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
            console.log(`[VARIABLE_ANALYSIS_DEBUG] boundVariables.${prop} finnes IKKE`);
          }
        }
      } else {
        console.log(`[VARIABLE_ANALYSIS_DEBUG] textNode har ingen boundVariables`);
      }
      
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Ferdig med text variabel analyse for ${textNode.name}`);
    } else {
      console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har text style, hopper over text variabler`);
    }
  }
}

// Analyser fargevariabler i fills og strokes
async function analyzeColorVariables(
  node: SceneNode,
  localVariableMap: Map<string, Variable>,
  localVariableIdSet: Set<string>,
  matches: VariableMatch[],
  variantName?: string
) {
  // Sjekk boundVariables for fills og strokes (direkte binding)
  const hasDirectFillsBinding = 'boundVariables' in node && node.boundVariables && 
    'fills' in node.boundVariables && Array.isArray((node.boundVariables as any).fills);
  const hasDirectStrokesBinding = 'boundVariables' in node && node.boundVariables && 
    'strokes' in node.boundVariables && Array.isArray((node.boundVariables as any).strokes);

  if (hasDirectFillsBinding) {
    // Sjekk fills (direkte binding)
    const fillsRefs = (node.boundVariables as any).fills;
    for (let i = 0; i < fillsRefs.length; i++) {
      const fillRef = fillsRefs[i];
      if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && fillRef.type === 'VARIABLE_ALIAS') {
        const currentVariable = await figma.variables.getVariableByIdAsync(fillRef.id);
        
        if (currentVariable) {
          // Søk etter lokal variabel med samme navn
          const localVariable = localVariableMap.get(currentVariable.name);
          
          // Hopp over hvis allerede koblet til lokal variabel (samme id)
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
    // Sjekk strokes (direkte binding)
    const strokesRefs = (node.boundVariables as any).strokes;
    for (let i = 0; i < strokesRefs.length; i++) {
      const strokeRef = strokesRefs[i];
      if (strokeRef && typeof strokeRef === 'object' && 'type' in strokeRef && strokeRef.type === 'VARIABLE_ALIAS') {
        const currentVariable = await figma.variables.getVariableByIdAsync(strokeRef.id);
        
        if (currentVariable) {
          const localVariable = localVariableMap.get(currentVariable.name);
          
          // Hopp over hvis allerede koblet til lokal variabel (samme id)
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

  // Sjekk fargevariabler i paint-objekter (indirekte binding) - kun hvis ikke direkte binding
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

  // Sjekk fargevariabler i stroke-objekter (indirekte binding) - kun hvis ikke direkte binding
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

// Rekursivt analyser node for variabler
async function analyzeNodeForVariables(
  node: SceneNode, 
  localVariableMap: Map<string, Variable>, 
  localVariableIdSet: Set<string>,
  localTextStyles: BaseStyle[],
  matches: VariableMatch[],
  variantName?: string
) {
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer node: ${node.name} (${node.type})${variantName ? ` i variant: ${variantName}` : ''}`);
  
  // Analyser boundVariables
  if ('boundVariables' in node && node.boundVariables) {
    // Debug: Log boundVariables for å se strukturen
    console.log(`[DEBUG] boundVariables for ${node.name}:`, JSON.stringify(node.boundVariables, null, 2));
    
    for (const [field, variableRef] of Object.entries(node.boundVariables)) {
      if (variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
        const currentVariable = await figma.variables.getVariableByIdAsync((variableRef as any).id);
        
        if (currentVariable) {
          console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant variabel: ${currentVariable.name} (${currentVariable.id}) på felt: ${field}`);
          
          // Hopp over hvis allerede lokal (id finnes i lokale)
          if (localVariableIdSet.has(currentVariable.id)) {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] HOPPER OVER: Variabel ${currentVariable.name} er allerede lokal`);
            continue;
          }
          
          // Søk etter lokal variabel med samme navn
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

  // Spesiell håndtering for text styles (prioritert over typografi-variabler)
  await analyzeTextStyles(node, localTextStyles, matches, variantName);

  // Spesiell håndtering for text variabler (kun hvis ingen text style)
  await analyzeTextVariables(node, localVariableMap, localVariableIdSet, matches, variantName);

  // Spesiell håndtering for fargevariabler i fills og strokes
  await analyzeColorVariables(node, localVariableMap, localVariableIdSet, matches, variantName);

  // Fjern duplikater basert på variabel-ID, men inkluder variantName i nøkkelen
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Før deduplisering: ${matches.length} matches`);
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
      // Hvis ingen currentVariable, legg til uansett
      uniqueMatches.push(match);
    }
  }
  
  console.log(`[VARIABLE_ANALYSIS_DEBUG] Etter deduplisering: ${uniqueMatches.length} matches`);
  
  // Erstatt matches med dedupliserte matches
  matches.length = 0;
  matches.push(...uniqueMatches);

  // Analyser children rekursivt
  if ('children' in node) {
    for (const child of node.children) {
      await analyzeNodeForVariables(child, localVariableMap, localVariableIdSet, localTextStyles, matches);
    }
  }
}

// Bytt variabler basert på matches
async function swapVariables(variableMatches: VariableMatch[]) {
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];
  const errorGroups: Map<string, number> = new Map();

  console.log(`[VARIABLE_SWAP_DEBUG] Starter bytting av ${variableMatches.length} variabler`);

  for (const match of variableMatches) {
    console.log(`[VARIABLE_SWAP_DEBUG] Behandler match: ${match.field} på ${match.nodeName}`);
    
    // Håndter text styles
    if (match.field === 'textStyleId' && match.localTextStyle) {
      try {
        // Finn noden som har denne text style
        console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med ID: ${match.nodeId}`);
        const node = await figma.getNodeByIdAsync(match.nodeId) as SceneNode;
        
        if (!node) {
          errorCount++;
          const errorMsg = `Kunne ikke finne node med ID: ${match.nodeId} for text style: ${match.localTextStyle.name}`;
          errors.push(errorMsg);
          console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
          continue;
        }
        
        if (node.type !== 'TEXT') {
          errorCount++;
          const errorMsg = `Node ${node.name} er ikke en TEXT-node (type: ${node.type}) for text style: ${match.localTextStyle.name}`;
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
        const errorMsg = `Feil ved bytting av text style ${match.localTextStyle?.name}: ${error}`;
        errors.push(errorMsg);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        continue;
      }
    }
    
    // Håndter vanlige variabler
    if (!match.localVariable) {
      errorCount++;
      const errorMsg = `Ingen lokal variabel funnet for: ${match.currentVariable?.name}`;
      errors.push(errorMsg);
      console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
      continue;
    }

    try {
      // Finn noden som har denne variabelen
      let node: SceneNode | null = null;
      
      // For text variabler, bruk nodeId direkte
      if (match.nodeId && (match.field === 'fontSize' || match.field === 'fontFamily' || match.field === 'fontStyle' || match.field === 'fontWeight' || match.field === 'lineHeight' || match.field === 'letterSpacing' || match.field === 'textCase' || match.field === 'textDecoration')) {
        console.log(`[VARIABLE_SWAP_DEBUG] Text variabel - bruker nodeId: ${match.nodeId}`);
        node = await figma.getNodeByIdAsync(match.nodeId) as SceneNode;
      } else {
        console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med variabel ID: ${match.currentVariable?.id}`);
        node = await findNodeWithVariable(match.currentVariable?.id || '');
      }
      
      if (!node) {
        errorCount++;
        const errorMsg = `Kunne ikke finne node for variabel: ${match.currentVariable?.name}`;
        errors.push(errorMsg);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        continue;
      }

      console.log(`[VARIABLE_SWAP_DEBUG] Fant node: ${node.name} (${node.type})`);

      // Hent den lokale variabelen
      const localVariable = await figma.variables.getVariableByIdAsync(match.localVariable.id);
      
      if (!localVariable) {
        errorCount++;
        const errorMsg = `Kunne ikke hente lokal variabel: ${match.localVariable.name}`;
        errors.push(errorMsg);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        continue;
      }

      console.log(`[VARIABLE_SWAP_DEBUG] Lokal variabel: ${localVariable.name} (${localVariable.id})`);

      // Skipp hvis allerede samme id (allerede koblet til lokal variabel)
      if (match.currentVariable && localVariable.id === match.currentVariable.id) {
        console.log(`[VARIABLE_SWAP_DEBUG] HOPPER OVER: Variabel allerede koblet til lokal (samme ID)`);
        continue;
      }

      // Sjekk om variabelen faktisk er koblet til noden før bytting
      console.log(`[VARIABLE_SWAP_DEBUG] Sjekker om variabel er koblet til node...`);
      const isCurrentlyBound = await checkIfVariableIsBoundToNode(node, match.currentVariable?.id || '', match.field);
      console.log(`[VARIABLE_SWAP_DEBUG] Variabel koblet til node: ${isCurrentlyBound}`);

      if (!isCurrentlyBound) {
        console.log(`[VARIABLE_SWAP_DEBUG] ADVARSEL: Variabel ${match.currentVariable?.name} er ikke lenger koblet til node ${node.name}`);
      }

      // Bytt variabelen
      console.log(`[VARIABLE_SWAP_DEBUG] Bytter variabel på node...`);
      await swapVariableOnNode(node, match.field, localVariable);
      
      // Verifiser at byttet faktisk skjedde
      console.log(`[VARIABLE_SWAP_DEBUG] Verifiserer bytting...`);
      const isNowBound = await checkIfVariableIsBoundToNode(node, localVariable.id, match.field);
      console.log(`[VARIABLE_SWAP_DEBUG] Ny variabel koblet til node: ${isNowBound}`);
      
      if (isNowBound) {
        successCount++;
        console.log(`[VARIABLE_SWAP_DEBUG] SUKSESS: Variabel byttet fra ${match.currentVariable?.name} til ${localVariable.name}`);
      } else {
        errorCount++;
        // Diagnostiser vanlige årsaker – spesielt instanser der variabelen ikke kan overstyres
        let reason = 'Variabel ble ikke koblet til node';
        if (node.type === 'INSTANCE') {
          reason = 'Variabel kan ikke overstyres i instans (ikke eksponert)';
        }
        const errorMsg = `Bytting feilet for ${match.currentVariable?.name} på ${node.name}: ${reason}`;
        errors.push(errorMsg);
        errorGroups.set(errorMsg, (errorGroups.get(errorMsg) || 0) + 1);
        console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
      }

    } catch (error) {
      errorCount++;
      const errorMsg = `Feil ved bytting av ${match.currentVariable?.name}: ${error}`;
      errors.push(errorMsg);
      errorGroups.set(errorMsg, (errorGroups.get(errorMsg) || 0) + 1);
      console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
    }
  }

  console.log(`[VARIABLE_SWAP_DEBUG] Bytting fullført: ${successCount} suksess, ${errorCount} feil`);

  // Send resultat til UI
  figma.ui.postMessage({
    type: 'swap-complete',
    successCount: successCount,
    errorCount: errorCount,
    errors: errors,
    errorGroups: Array.from(errorGroups.entries()).map(([message, count]) => ({ message, count }))
  });
}

// Finn node som har en spesifikk variabel eller nodeId
async function findNodeWithVariable(variableIdOrNodeId: string): Promise<SceneNode | null> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return null;

  const selectedNode = selection[0];
  
  // Hvis det er en nodeId (starter med "I:" eller lignende), søk direkte etter node
  if (variableIdOrNodeId.startsWith('I:') || variableIdOrNodeId.startsWith('V:')) {
    return findNodeByIdRecursive(selectedNode as SceneNode, variableIdOrNodeId);
  }
  
  if (selectedNode.type === 'COMPONENT_SET') {
    // For ComponentSet, søk i alle varianter
    return findNodeWithVariableInComponentSet(selectedNode as ComponentSetNode, variableIdOrNodeId);
  } else {
    // For enkelt komponent eller instans
    return findNodeWithVariableRecursive(selectedNode as SceneNode, variableIdOrNodeId);
  }
}

// Søk etter node med variabel i ComponentSet
function findNodeWithVariableInComponentSet(componentSet: ComponentSetNode, variableId: string): SceneNode | null {
  // Søk i alle varianter
  for (const variant of componentSet.children) {
    if (variant.type === 'COMPONENT') {
      const found = findNodeWithVariableRecursive(variant, variableId);
      if (found) return found;
    }
  }
  return null;
}

// Søk etter node basert på nodeId
function findNodeByIdRecursive(node: SceneNode, nodeId: string): SceneNode | null {
  console.log(`[VARIABLE_SWAP_DEBUG] Søker i node: ${node.name} (${node.id}) for ID: ${nodeId}`);
  
  // Sjekk om denne noden har riktig ID
  if (node.id === nodeId) {
    console.log(`[VARIABLE_SWAP_DEBUG] Fant node: ${node.name} (${node.id})`);
    return node;
  }

  // Søk i children
  if ('children' in node) {
    for (const child of node.children) {
      const found = findNodeByIdRecursive(child, nodeId);
      if (found) return found;
    }
  }

  return null;
}

// Rekursivt søk etter node med variabel
function findNodeWithVariableRecursive(node: SceneNode, variableId: string): SceneNode | null {
  // Sjekk om denne noden har variabelen
  if ('boundVariables' in node && node.boundVariables) {
    for (const variableRef of Object.values(node.boundVariables)) {
      if (variableRef && typeof variableRef === 'object' && 'id' in variableRef && variableRef.id === variableId) {
        return node;
      }
    }
  }

  // Sjekk fargevariabler i fills og strokes
  if (hasColorVariable(node, variableId)) {
    return node;
  }

  // Søk i children
  if ('children' in node) {
    for (const child of node.children) {
      const found = findNodeWithVariableRecursive(child, variableId);
      if (found) return found;
    }
  }

  return null;
}

// Hjelpefunksjon for å sjekke om en variabel er koblet til en node
async function checkIfVariableIsBoundToNode(node: SceneNode, variableId: string, field: string): Promise<boolean> {
  // Sjekk boundVariables direkte
  if ('boundVariables' in node && node.boundVariables) {
    // Spesiell håndtering for text variabler (lagret som arrays)
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
      // For andre variabler, sjekk direkte
      for (const [boundField, variableRef] of Object.entries(node.boundVariables)) {
        if (boundField === field && variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
          if ((variableRef as any).id === variableId) {
            return true;
          }
        }
      }
    }
  }

  // Spesiell sjekk for fargevariabler
  if (field.startsWith('fills[') || field.startsWith('strokes[')) {
    return hasColorVariable(node, variableId);
  }

  return false;
}

// Hjelpefunksjon for å sjekke om node har fargevariabel
function hasColorVariable(node: SceneNode, variableId: string): boolean {
  // Sjekk boundVariables for fills og strokes (direkte binding)
  if ('boundVariables' in node && node.boundVariables) {
    // Sjekk fills
    if ('fills' in node.boundVariables && Array.isArray((node.boundVariables as any).fills)) {
      const fillsRefs = (node.boundVariables as any).fills;
      for (const fillRef of fillsRefs) {
        if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && 
            fillRef.type === 'VARIABLE_ALIAS' && fillRef.id === variableId) {
          return true;
        }
      }
    }

    // Sjekk strokes
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

  // Sjekk fargevariabler i paint-objekter (indirekte binding)
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

  // Sjekk fargevariabler i stroke-objekter (indirekte binding)
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

// Bytt variabel på en node
async function swapVariableOnNode(node: SceneNode, field: string, newVariable: Variable) {
  console.log(`[VARIABLE_SWAP_DEBUG] swapVariableOnNode: ${node.name}, felt: ${field}, ny variabel: ${newVariable.name}`);
  
  if (!('boundVariables' in node)) {
    throw new Error('Node støtter ikke variabel-binding');
  }

  // Spesiell håndtering for ulike felttyper
  if (field === 'fills' || field === 'strokes') {
    console.log(`[VARIABLE_SWAP_DEBUG] Håndterer ${field} array`);
    // For fills og strokes må vi håndtere paint-objekter
    const paints = field === 'fills' ? (node as any).fills : (node as any).strokes;
    
    if (Array.isArray(paints)) {
      console.log(`[VARIABLE_SWAP_DEBUG] ${field} array har ${paints.length} elementer`);
      // Lag en kopi av paints-arrayen før endring
      const paintsCopy = [...paints];
      for (let i = 0; i < paintsCopy.length; i++) {
        const paint = paintsCopy[i];
        if (paint && paint.type === 'SOLID') {
          console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på ${field}[${i}]`);
          // Sett variabel på color-egenskapen til paint
          const newPaint = figma.variables.setBoundVariableForPaint(paint, 'color', newVariable);
          paintsCopy[i] = newPaint;
        }
      }
      
      if (field === 'fills') {
        (node as any).fills = paintsCopy;
      } else {
        (node as any).strokes = paintsCopy;
      }
      console.log(`[VARIABLE_SWAP_DEBUG] ${field} array oppdatert`);
    }
  } else if (field.startsWith('fills[') && field.endsWith(']')) {
    // Håndter fargevariabler i fills (direkte binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Håndterer direkte fills binding: ${field}`);
    const indexMatch = field.match(/fills\[(\d+)\]/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      const fills = (node as any).fills;
      if (Array.isArray(fills) && fills[index]) {
        console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på fills[${index}]`);
        // Lag en kopi av fills-arrayen før endring
        const fillsCopy = [...fills];
        // For direkte binding, erstatt hele fill-objektet
        const newFill = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
        fillsCopy[index] = newFill;
        // Sett den nye arrayen
        (node as any).fills = fillsCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}] oppdatert`);
      }
    }
  } else if (field.startsWith('strokes[') && field.endsWith(']')) {
    // Håndter fargevariabler i strokes (direkte binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Håndterer direkte strokes binding: ${field}`);
    const indexMatch = field.match(/strokes\[(\d+)\]/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      const strokes = (node as any).strokes;
      if (Array.isArray(strokes) && strokes[index]) {
        console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på strokes[${index}]`);
        // Lag en kopi av strokes-arrayen før endring
        const strokesCopy = [...strokes];
        // For direkte binding, erstatt hele stroke-objektet
        const newStroke = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
        strokesCopy[index] = newStroke;
        // Sett den nye arrayen
        (node as any).strokes = strokesCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}] oppdatert`);
      }
    }
  } else if (field.startsWith('fills[') && field.endsWith('].color')) {
    // Håndter spesifikke fargevariabler i fills (indirekte binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Håndterer indirekte fills binding: ${field}`);
    const indexMatch = field.match(/fills\[(\d+)\]\.color/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      const fills = (node as any).fills;
      if (Array.isArray(fills) && fills[index] && fills[index].type === 'SOLID') {
        console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på fills[${index}].color`);
        // Lag en kopi av fills-arrayen før endring
        const fillsCopy = [...fills];
        const newPaint = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
        fillsCopy[index] = newPaint;
        // Sett den nye arrayen
        (node as any).fills = fillsCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}].color oppdatert`);
      }
    }
  } else if (field.startsWith('strokes[') && field.endsWith('].color')) {
    // Håndter spesifikke fargevariabler i strokes (indirekte binding)
    console.log(`[VARIABLE_SWAP_DEBUG] Håndterer indirekte strokes binding: ${field}`);
    const indexMatch = field.match(/strokes\[(\d+)\]\.color/);
    if (indexMatch) {
      const index = parseInt(indexMatch[1]);
      const strokes = (node as any).strokes;
      if (Array.isArray(strokes) && strokes[index] && strokes[index].type === 'SOLID') {
        console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på strokes[${index}].color`);
        // Lag en kopi av strokes-arrayen før endring
        const strokesCopy = [...strokes];
        const newPaint = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
        strokesCopy[index] = newPaint;
        // Sett den nye arrayen
        (node as any).strokes = strokesCopy;
        console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}].color oppdatert`);
      }
    }
  } else if (node.type === 'TEXT' && ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'].includes(field)) {
    // Håndter text variabler på TEXT-noder
    console.log(`[VARIABLE_SWAP_DEBUG] Håndterer text variabel: ${field} på TEXT-node`);
    const textNode = node as TextNode;
    
    // Last inn font før endring (fra reference.ts)
    try {
      if (textNode.fontName === figma.mixed) {
        console.warn(`[VARIABLE_SWAP_DEBUG] Tekst har mixed fonts, kan ikke laste inn font for ${field}`);
      } else {
        console.log(`[VARIABLE_SWAP_DEBUG] Laster inn font for ${field}: ${textNode.fontName.family} ${textNode.fontName.style}`);
        await figma.loadFontAsync(textNode.fontName);
        console.log(`[VARIABLE_SWAP_DEBUG] Font lastet inn for ${field}`);
      }
      
      // Bruk setBoundVariable for text variabler (ikke direkte assignment)
      console.log(`[VARIABLE_SWAP_DEBUG] Bruker setBoundVariable for text variabel: ${field}`);
      textNode.setBoundVariable(field as VariableBindableNodeField, newVariable);
      console.log(`[VARIABLE_SWAP_DEBUG] Text variabel ${field} satt til: ${newVariable.name}`);
    } catch (fontError) {
      console.warn(`[VARIABLE_SWAP_DEBUG] Kunne ikke laste inn font for ${field} på ${textNode.name}:`, fontError);
      // Prøv å sette variabel uansett
      console.log(`[VARIABLE_SWAP_DEBUG] Bruker setBoundVariable for text variabel: ${field} (uten font-loading)`);
      textNode.setBoundVariable(field as VariableBindableNodeField, newVariable);
      console.log(`[VARIABLE_SWAP_DEBUG] Text variabel ${field} satt til: ${newVariable.name} (uten font-loading)`);
    }
  } else {
    // For andre felttyper, bruk setBoundVariable
    console.log(`[VARIABLE_SWAP_DEBUG] Bruker setBoundVariable for felt: ${field}`);
    node.setBoundVariable(field as VariableBindableNodeField, newVariable);
    console.log(`[VARIABLE_SWAP_DEBUG] setBoundVariable fullført for ${field}`);
  }
}
