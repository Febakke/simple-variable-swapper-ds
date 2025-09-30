"use strict";
// Simple Variable Swapper - Figma Plugin
// This plugin helps users swap variables on imported components
// to use local variables in their organization
// Show UI with size and theme
figma.showUI(__html__, {
    width: 400,
    height: 500,
    themeColors: true
});
// Main message handler
figma.ui.onmessage = async (msg) => {
    try {
        if (msg.type === 'analyze-selection') {
            await analyzeSelection();
        }
        else if (msg.type === 'swap-variables') {
            await swapVariables(msg.variableMatches || []);
        }
        else if (msg.type === 'find-external-instances') {
            await findExternalInstancesAndReport();
        }
        else if (msg.type === 'swap-external-instances') {
            await swapExternalInstancesAndReport();
        }
        else if (msg.type === 'swap-instances-and-variables') {
            await swapInstancesAndVariablesCombined();
        }
        else if (msg.type === 'cancel') {
            figma.closePlugin();
        }
    }
    catch (error) {
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
    const localVariableIdSet = new Set();
    localVariables.forEach(variable => {
        localVariableMap.set(variable.name, variable);
        localVariableIdSet.add(variable.id);
    });
    // Get all local text styles
    const localTextStyles = await figma.getLocalTextStylesAsync();
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant ${localVariables.length} lokale variabler og ${localTextStyles.length} lokale text styles`);
    // Analyze component for variables
    const variableMatches = [];
    // Count top-level external instances under selection
    let externalCount = 0;
    try {
        const rootForScan = selectedNode;
        const externalInstances = await collectExternalInstances(rootForScan);
        externalCount = externalInstances.length;
        console.log(`[ANALYZE_TRACE] externalCount=${externalCount}`);
    }
    catch (e) {
        console.warn('[ANALYZE_TRACE] external scan failed', e);
    }
    if (selectedNode.type === 'COMPONENT_SET') {
        // For ComponentSet, analyze all variants
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer ComponentSet med ${selectedNode.children.length} varianter`);
        await analyzeComponentSetForVariables(selectedNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
    }
    else {
        // For single component or instance
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer enkelt komponent/instans`);
        await analyzeNodeForVariables(selectedNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
    }
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyse fullført. Totalt ${variableMatches.length} variabler funnet`);
    // Send result to UI
    const result = {
        type: 'analysis-complete',
        variableMatches: variableMatches,
        componentName: selectedNode.name,
        componentType: selectedNode.type,
        externalCount: externalCount
    };
    // Add variantCount for ComponentSet
    if (selectedNode.type === 'COMPONENT_SET') {
        result.variantCount = selectedNode.children.length;
    }
    figma.ui.postMessage(result);
}
// Analyze ComponentSet for variables (all variants)
async function analyzeComponentSetForVariables(componentSet, localVariableMap, localVariableIdSet, localTextStyles, matches) {
    // Analyze each variant in ComponentSet
    for (const variant of componentSet.children) {
        if (variant.type === 'COMPONENT') {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer variant: ${variant.name}`);
            await analyzeNodeForVariables(variant, localVariableMap, localVariableIdSet, localTextStyles, matches, variant.name);
        }
    }
}
// Analyze text styles on text nodes
async function analyzeTextStyles(node, localTextStyles, matches, variantName) {
    if (node.type === 'TEXT') {
        const textNode = node;
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
                }
                else {
                    console.log(`[VARIABLE_ANALYSIS_DEBUG] Ingen lokal text style match funnet for navn: ${currentTextStyle.name}`);
                }
            }
            else {
                console.log(`[VARIABLE_ANALYSIS_DEBUG] Kunne ikke finne text style med ID: ${textNode.textStyleId}`);
            }
        }
        else {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har ingen textStyleId`);
        }
    }
}
// Analyze text variables on text nodes (only if no text style)
async function analyzeTextVariables(node, localVariableMap, localVariableIdSet, matches, variantName) {
    if (node.type === 'TEXT') {
        const textNode = node;
        // Only analyze text variables if no text style is set
        if (!textNode.textStyleId || textNode.textStyleId === '') {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har ingen text style, sjekker text variabler`);
            const textProperties = ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'];
            // Check boundVariables for typography variables (as shown in logs)
            if ('boundVariables' in textNode && textNode.boundVariables) {
                for (const prop of textProperties) {
                    if (prop in textNode.boundVariables) {
                        const boundVar = textNode.boundVariables[prop];
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
                                    }
                                    else {
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
                    }
                    else {
                    }
                }
            }
            else {
            }
        }
        else {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Tekstnode ${textNode.name} har text style, hopper over text variabler`);
        }
    }
}
// Analyze color variables in fills and strokes
// Color variables can be bound in two ways:
// 1. Direct binding: boundVariables.fills[0] = {type: 'VARIABLE_ALIAS', id: '...'}
// 2. Indirect binding: fills[0].color = {type: 'VARIABLE_ALIAS', id: '...'}
async function analyzeColorVariables(node, localVariableMap, localVariableIdSet, matches, variantName) {
    // Check boundVariables for fills and strokes (direct binding)
    const hasDirectFillsBinding = 'boundVariables' in node && node.boundVariables &&
        'fills' in node.boundVariables && Array.isArray(node.boundVariables.fills);
    const hasDirectStrokesBinding = 'boundVariables' in node && node.boundVariables &&
        'strokes' in node.boundVariables && Array.isArray(node.boundVariables.strokes);
    if (hasDirectFillsBinding) {
        // Check fills (direct binding)
        const fillsRefs = node.boundVariables.fills;
        for (let i = 0; i < fillsRefs.length; i++) {
            const fillRef = fillsRefs[i];
            if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && fillRef.type === 'VARIABLE_ALIAS') {
                const currentVariable = await figma.variables.getVariableByIdAsync(fillRef.id);
                if (currentVariable) {
                    // Search for local variable with same name
                    const localVariable = localVariableMap.get(currentVariable.name);
                    // Skip if already connected to local variable (same id)
                    if (localVariable && localVariable.id === currentVariable.id)
                        continue;
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
        const strokesRefs = node.boundVariables.strokes;
        for (let i = 0; i < strokesRefs.length; i++) {
            const strokeRef = strokesRefs[i];
            if (strokeRef && typeof strokeRef === 'object' && 'type' in strokeRef && strokeRef.type === 'VARIABLE_ALIAS') {
                const currentVariable = await figma.variables.getVariableByIdAsync(strokeRef.id);
                if (currentVariable) {
                    const localVariable = localVariableMap.get(currentVariable.name);
                    // Skip if already connected to local variable (same id)
                    if (localVariable && localVariable.id === currentVariable.id)
                        continue;
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
                const colorValue = fill.color;
                if (colorValue && typeof colorValue === 'object' && 'type' in colorValue && colorValue.type === 'VARIABLE_ALIAS') {
                    const currentVariable = await figma.variables.getVariableByIdAsync(colorValue.id);
                    if (currentVariable) {
                        if (localVariableIdSet.has(currentVariable.id))
                            continue;
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
                const colorValue = stroke.color;
                if (colorValue && typeof colorValue === 'object' && 'type' in colorValue && colorValue.type === 'VARIABLE_ALIAS') {
                    const currentVariable = await figma.variables.getVariableByIdAsync(colorValue.id);
                    if (currentVariable) {
                        if (localVariableIdSet.has(currentVariable.id))
                            continue;
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
async function analyzeNodeForVariables(node, localVariableMap, localVariableIdSet, localTextStyles, matches, variantName) {
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer node: ${node.name} (${node.type})${variantName ? ` i variant: ${variantName}` : ''}`);
    // Analyze boundVariables
    if ('boundVariables' in node && node.boundVariables) {
        for (const [field, variableRef] of Object.entries(node.boundVariables)) {
            if (variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
                const currentVariable = await figma.variables.getVariableByIdAsync(variableRef.id);
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
                    }
                    else {
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
    const uniqueMatches = [];
    const seenVariableIds = new Set();
    for (const match of matches) {
        if (match.currentVariable) {
            const key = `${match.currentVariable.id}-${match.nodeId}-${match.field}-${match.variantName || 'default'}`;
            if (!seenVariableIds.has(key)) {
                seenVariableIds.add(key);
                uniqueMatches.push(match);
                console.log(`[VARIABLE_ANALYSIS_DEBUG] Beholder match: ${match.currentVariable.name} på ${match.nodeName} (${match.variantName || 'default'}) - nodeId: ${match.nodeId}`);
            }
            else {
                console.log(`[VARIABLE_ANALYSIS_DEBUG] Fjerner duplikat: ${match.currentVariable.name} på ${match.nodeName} (${match.variantName || 'default'}) - nodeId: ${match.nodeId}`);
            }
        }
        else {
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
// Helpers for variant-aware matching
function normalizeVariantString(variantStr) {
    if (!variantStr)
        return '';
    const parts = variantStr
        .split(',')
        .map(p => p.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    return parts.join(',');
}
function parseComponentNameParts(name) {
    const [base, ...rest] = name.split('/');
    const variantStr = rest.join('/');
    return { baseName: base || name, variantKey: normalizeVariantString(variantStr || '') };
}
function safeNodeName(node) {
    try {
        if (!node)
            return '[null]';
        return node.name;
    }
    catch (_a) {
        try {
            return `[id:${node.id || 'unknown'}]`;
        }
        catch (_b) {
            return '[unknown]';
        }
    }
}
function normalizeSetName(name) {
    if (!name)
        return '';
    // strip leading dots/underscores, trim, collapse spaces, lowercase
    const stripped = name.replace(/^([._])+/, '').trim();
    return stripped.replace(/\s+/g, ' ').toLowerCase();
}
async function buildLocalComponentIndex() {
    const byFullName = new Map();
    const bySetAndVariant = new Map();
    const bySetAndVariantNormalized = new Map();
    const bySet = new Map();
    const bySetNormalized = new Map();
    try {
        // Always load all pages to index components across the whole file
        try {
            console.log('[LOCAL_INDEX_TRACE] loadAllPagesAsync: start');
            await figma.loadAllPagesAsync();
            console.log('[LOCAL_INDEX_TRACE] loadAllPagesAsync: done');
        }
        catch (loadErr) {
            console.warn('[LOCAL_INDEX_TRACE] loadAllPagesAsync failed', loadErr);
        }
        const components = figma.root.findAll(n => n.type === 'COMPONENT');
        console.log(`[LOCAL_INDEX_TRACE] phase=allPages count=${components.length}`);
        let i = 0;
        for (const comp of components) {
            i++;
            if (i <= 110) {
                // keep early items verbose to diagnose indexing
                console.log(`[LOCAL_INDEX_TRACE] scan #${i} compName="${comp.name}" id=${comp.id}`);
            }
            byFullName.set(comp.name, comp);
            const parent = comp.parent;
            const { baseName, variantKey } = parseComponentNameParts(comp.name);
            const setName = parent && parent.type === 'COMPONENT_SET' ? parent.name : baseName;
            if (!bySetAndVariant.has(setName))
                bySetAndVariant.set(setName, new Map());
            const normalizedSet = normalizeSetName(setName);
            if (!bySetAndVariantNormalized.has(normalizedSet))
                bySetAndVariantNormalized.set(normalizedSet, new Map());
            // Store representative per set (first one wins)
            if (!bySet.has(setName))
                bySet.set(setName, comp);
            if (!bySetNormalized.has(normalizedSet))
                bySetNormalized.set(normalizedSet, comp);
            // Determine variant key: for variants inside a ComponentSet without '/', the entire name is the variant string
            let key = variantKey || '';
            if (parent && parent.type === 'COMPONENT_SET') {
                key = comp.name.includes('/') ? (variantKey || '') : normalizeVariantString(comp.name);
            }
            if (!bySetAndVariant.get(setName).has(key)) {
                bySetAndVariant.get(setName).set(key, comp);
            }
            if (!bySetAndVariantNormalized.get(normalizedSet).has(key)) {
                bySetAndVariantNormalized.get(normalizedSet).set(key, comp);
            }
            // Verbose trace for first 110 items; avoid spamming logs for very large files
            if (i <= 110) {
                console.log(`[LOCAL_INDEX_TRACE] add byFullName="${comp.name}" id=${comp.id} setName="${setName}" variantKey="${key}" parentType=${parent ? parent.type : 'none'}`);
            }
        }
    }
    catch (e) {
        console.warn('[INSTANCE_SWAP_DEBUG] Could not index local components', e);
    }
    const setNames = Array.from(bySet.keys());
    console.log(`[INSTANCE_SWAP_DEBUG] Local component index sizes: full=${byFullName.size}, sets=${bySet.size}`);
    console.log(`[LOCAL_INDEX_TRACE] setNames sample: ${setNames.slice(0, 20).join(' | ')}`);
    return { byFullName, bySetAndVariant, bySetAndVariantNormalized, bySet, bySetNormalized };
}
async function collectExternalInstances(root) {
    // Only collect top-level external instances (do not traverse into instance children)
    const result = [];
    const stack = [{ node: root, insideInstance: false }];
    while (stack.length > 0) {
        const { node: n, insideInstance } = stack.pop();
        if (n.type === 'INSTANCE') {
            const inst = n;
            try {
                const main = await inst.getMainComponentAsync();
                if (main && main.remote === true) {
                    result.push(inst);
                }
            }
            catch (e) {
                console.warn('[INSTANCE_SWAP_DEBUG] Could not resolve main component for instance', e);
            }
            // Do not traverse into children of instances
            continue;
        }
        if (!insideInstance && 'children' in n) {
            for (const c of n.children)
                stack.push({ node: c, insideInstance: false });
        }
    }
    return result;
}
async function autoSwapExternalInstancesUnderSelection() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0)
        return { swappedCount: 0, attemptedCount: 0, failures: [] };
    const root = selection[0];
    const externalInstances = await collectExternalInstances(root);
    if (externalInstances.length === 0) {
        console.log('[INSTANCE_SWAP_DEBUG] No external instances detected under selection');
        return { swappedCount: 0, attemptedCount: 0, failures: [] };
    }
    console.log(`[INSTANCE_SWAP_DEBUG] Found ${externalInstances.length} external instances`);
    const localIndex = await buildLocalComponentIndex();
    let swapped = 0;
    const failures = [];
    for (const inst of externalInstances) {
        try {
            // Re-resolve instance by id to avoid stale reference issues in dynamic-page
            const freshInst = await figma.getNodeByIdAsync(inst.id);
            if (!freshInst || freshInst.removed) {
                const msg = `Instance disappeared during swap: id=${inst.id}`;
                failures.push(msg);
                console.warn('[EXTERNAL_SWAP] ' + msg);
                continue;
            }
            const main = await freshInst.getMainComponentAsync();
            const mainName = main ? main.name : inst.name;
            // Strategy: ALWAYS use ComponentSet + variant (ignore instance's display name and full-name match)
            const parent = main ? main.parent : null;
            const setName = parent && parent.type === 'COMPONENT_SET' ? parent.name : parseComponentNameParts(mainName).baseName;
            const variantKey = parent && parent.type === 'COMPONENT_SET' && !mainName.includes('/')
                ? normalizeVariantString(mainName)
                : parseComponentNameParts(mainName).variantKey;
            let local;
            let variantMap = setName ? localIndex.bySetAndVariant.get(setName) : undefined;
            // If not found, try normalized lookup (handles leading ./_ and case differences)
            if (!variantMap) {
                const normalizedSet = normalizeSetName(setName);
                variantMap = localIndex.bySetAndVariantNormalized.get(normalizedSet);
                if (variantMap) {
                    console.log(`[MATCH_TRACE] normalized setName hit for "${setName}" -> "${normalizedSet}"`);
                }
            }
            const availableKeys = variantMap ? Array.from(variantMap.keys()) : [];
            console.log(`[MATCH_TRACE] instance name="${safeNodeName(freshInst)}" setName="${setName}" variantKey="${variantKey}" hasVariantMap=${!!variantMap} availableKeysCount=${availableKeys.length} keysSample="${availableKeys.slice(0, 20).join(' | ')}"`);
            if (variantMap) {
                if (variantKey && variantMap.has(variantKey)) {
                    local = variantMap.get(variantKey);
                    console.log(`[MATCH_TRACE] variantMap MATCH setName="${setName}" variantKey="${variantKey}" localName="${local === null || local === void 0 ? void 0 : local.name}"`);
                }
                else if (variantMap.has('')) {
                    // fallback to the base component if present
                    local = variantMap.get('');
                    console.log(`[MATCH_TRACE] variantMap FALLBACK base component setName="${setName}" localName="${local === null || local === void 0 ? void 0 : local.name}"`);
                }
            }
            // Final fallback: representative per set (ignores variant entirely)
            if (!local) {
                local = localIndex.bySet.get(setName) || localIndex.bySetNormalized.get(normalizeSetName(setName));
                if (local) {
                    console.log(`[MATCH_TRACE] set representative fallback used for setName="${setName}" localName="${local.name}"`);
                }
            }
            if (local) {
                try {
                    freshInst.swapComponent(local);
                }
                catch (swapErr) {
                    const msg = `Swap failed for id=${freshInst.id} setName=${setName} variant=${variantKey}: ${swapErr}`;
                    failures.push(msg);
                    console.warn('[EXTERNAL_SWAP] ' + msg);
                    continue;
                }
                swapped++;
                console.log(`[INSTANCE_SWAP_DEBUG] Swapped instance "${safeNodeName(freshInst)}" -> local "${local.name}"`);
            }
            else {
                failures.push(`No local component found for setName: ${setName} variant: ${variantKey || '(base)'}`);
                console.log(`[INSTANCE_SWAP_DEBUG] No local match for setName="${setName}" variantKey="${variantKey}". Hint: check available keys above.`);
            }
        }
        catch (e) {
            const msg = `Error swapping external instance ${inst.name}: ${e}`;
            failures.push(msg);
            console.warn('[INSTANCE_SWAP_DEBUG] ' + msg);
        }
    }
    return { swappedCount: swapped, attemptedCount: externalInstances.length, failures };
}
// New: find external instances and send count to UI
async function findExternalInstancesAndReport() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
        figma.ui.postMessage({ type: 'error', message: 'Please select a component first.' });
        return;
    }
    const root = selection[0];
    const externalInstances = await collectExternalInstances(root);
    console.log(`[EXTERNAL_SCAN] Found ${externalInstances.length} external instance(s)`);
    // Try to enrich with component set names and variant info
    const sample = [];
    for (const inst of externalInstances.slice(0, 10)) {
        try {
            const main = await inst.getMainComponentAsync();
            const parent = main ? main.parent : null;
            const setName = parent && parent.type === 'COMPONENT_SET' ? parent.name : '';
            const mainName = main ? main.name : inst.name;
            sample.push({ inst: inst.name, setName, mainName });
        }
        catch (_a) { }
    }
    if (sample.length > 0) {
        console.log(`[EXTERNAL_SCAN] sample=${JSON.stringify(sample)}`);
    }
    figma.ui.postMessage({ type: 'external-instances-found', count: externalInstances.length });
}
// New: explicit swap external instances via button
async function swapExternalInstancesAndReport() {
    try {
        console.log('[EXTERNAL_SWAP] start');
        const result = await autoSwapExternalInstancesUnderSelection();
        console.log(`[EXTERNAL_SWAP] done swapped=${result.swappedCount} attempted=${result.attemptedCount} failures=${result.failures.length}`);
        figma.ui.postMessage({
            type: 'external-swap-complete',
            swappedCount: result.swappedCount,
            attemptedCount: result.attemptedCount,
            failures: result.failures
        });
    }
    catch (e) {
        console.warn('[EXTERNAL_SWAP] error', e);
        figma.ui.postMessage({ type: 'error', message: `External swap failed: ${e}` });
    }
}
// Combined flow: swap instances, re-analyze, then swap variables
async function swapInstancesAndVariablesCombined() {
    try {
        console.log('[COMBINED_SWAP] start');
        const instResult = await autoSwapExternalInstancesUnderSelection();
        console.log(`[COMBINED_SWAP] instances swapped=${instResult.swappedCount}/${instResult.attemptedCount}`);
        // Re-analyze to get fresh variable matches
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.ui.postMessage({ type: 'error', message: 'Please select a component first.' });
            return;
        }
        const selectedNode = selection[0];
        // Reuse analysis logic to compute variable matches
        const localVariables = await figma.variables.getLocalVariablesAsync();
        const localVariableMap = new Map();
        const localVariableIdSet = new Set();
        localVariables.forEach(variable => {
            localVariableMap.set(variable.name, variable);
            localVariableIdSet.add(variable.id);
        });
        const localTextStyles = await figma.getLocalTextStylesAsync();
        const variableMatches = [];
        if (selectedNode.type === 'COMPONENT_SET') {
            await analyzeComponentSetForVariables(selectedNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
        }
        else {
            await analyzeNodeForVariables(selectedNode, localVariableMap, localVariableIdSet, localTextStyles, variableMatches);
        }
        console.log(`[COMBINED_SWAP] re-analysis matches=${variableMatches.length}`);
        // Filter to only valid matches (localVariable/localTextStyle present)
        const actionable = variableMatches.filter(m => (m.localVariable !== null) || (m.localTextStyle !== null));
        await swapVariables(actionable);
        figma.ui.postMessage({
            type: 'combined-swap-complete',
            swappedCount: instResult.swappedCount,
            attemptedCount: instResult.attemptedCount,
            failures: instResult.failures
        });
    }
    catch (e) {
        console.warn('[COMBINED_SWAP] error', e);
        figma.ui.postMessage({ type: 'error', message: `Combined swap failed: ${e}` });
    }
}
// Swap variables based on matches
async function swapVariables(variableMatches) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const errorGroups = new Map();
    console.log(`[VARIABLE_SWAP_DEBUG] Starter bytting av ${variableMatches.length} variabler`);
    // Auto-swap external instances to local counterparts to allow variable overrides
    try {
        const autoSwap = await autoSwapExternalInstancesUnderSelection();
        if (autoSwap.attemptedCount > 0) {
            console.log(`[INSTANCE_SWAP_DEBUG] Auto-swapped ${autoSwap.swappedCount}/${autoSwap.attemptedCount} external instances`);
            // Surface failures alongside variable swap errors so user is informed
            for (const f of autoSwap.failures) {
                errors.push(f);
                errorGroups.set(f, (errorGroups.get(f) || 0) + 1);
            }
        }
    }
    catch (e) {
        const msg = `Auto-swap external instances failed: ${e}`;
        console.warn('[INSTANCE_SWAP_DEBUG] ' + msg);
        errors.push(msg);
        errorGroups.set(msg, (errorGroups.get(msg) || 0) + 1);
    }
    for (const match of variableMatches) {
        console.log(`[VARIABLE_SWAP_DEBUG] Behandler match: ${match.field} på ${match.nodeName}`);
        // Handle text styles
        if (match.field === 'textStyleId' && match.localTextStyle) {
            try {
                // Find the node that has this text style
                console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med ID: ${match.nodeId}`);
                const node = await figma.getNodeByIdAsync(match.nodeId);
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
                const textNode = node;
                console.log(`[VARIABLE_SWAP_DEBUG] Fant TEXT-node: ${textNode.name}`);
                // Bytt text style
                console.log(`[VARIABLE_SWAP_DEBUG] Bytter text style til: ${match.localTextStyle.name} (${match.localTextStyle.id})`);
                await textNode.setTextStyleIdAsync(match.localTextStyle.id);
                successCount++;
                console.log(`[VARIABLE_SWAP_DEBUG] SUKSESS: Text style byttet til ${match.localTextStyle.name}`);
                continue;
            }
            catch (error) {
                errorCount++;
                const errorMsg = `Error swapping text style ${(_a = match.localTextStyle) === null || _a === void 0 ? void 0 : _a.name}: ${error}`;
                errors.push(errorMsg);
                console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
                continue;
            }
        }
        // Handle regular variables
        if (!match.localVariable) {
            errorCount++;
            const errorMsg = `No local variable found for: ${(_b = match.currentVariable) === null || _b === void 0 ? void 0 : _b.name}`;
            errors.push(errorMsg);
            console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
            continue;
        }
        try {
            // Find the node that has this variable
            let node = null;
            // For text variables, use nodeId directly
            if (match.nodeId && (match.field === 'fontSize' || match.field === 'fontFamily' || match.field === 'fontStyle' || match.field === 'fontWeight' || match.field === 'lineHeight' || match.field === 'letterSpacing' || match.field === 'textCase' || match.field === 'textDecoration')) {
                console.log(`[VARIABLE_SWAP_DEBUG] Text variabel - bruker nodeId: ${match.nodeId}`);
                node = await figma.getNodeByIdAsync(match.nodeId);
            }
            else {
                console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med variabel ID: ${(_c = match.currentVariable) === null || _c === void 0 ? void 0 : _c.id}`);
                node = await findNodeWithVariable(((_d = match.currentVariable) === null || _d === void 0 ? void 0 : _d.id) || '');
            }
            if (!node) {
                errorCount++;
                const errorMsg = `Could not find node for variable: ${(_e = match.currentVariable) === null || _e === void 0 ? void 0 : _e.name}`;
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
            const isCurrentlyBound = await checkIfVariableIsBoundToNode(node, ((_f = match.currentVariable) === null || _f === void 0 ? void 0 : _f.id) || '', match.field);
            console.log(`[VARIABLE_SWAP_DEBUG] Variabel koblet til node: ${isCurrentlyBound}`);
            if (!isCurrentlyBound) {
                console.log(`[VARIABLE_SWAP_DEBUG] ADVARSEL: Variabel ${(_g = match.currentVariable) === null || _g === void 0 ? void 0 : _g.name} er ikke lenger koblet til node ${node.name}`);
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
                console.log(`[VARIABLE_SWAP_DEBUG] SUKSESS: Variabel byttet fra ${(_h = match.currentVariable) === null || _h === void 0 ? void 0 : _h.name} til ${localVariable.name}`);
            }
            else {
                errorCount++;
                // Diagnose common causes - especially instances where variable cannot be overridden
                let reason = 'Variable was not connected to node';
                if (node.type === 'INSTANCE') {
                    reason = 'Variable cannot be overridden in instance (not exposed)';
                }
                const errorMsg = `Swapping failed for ${(_j = match.currentVariable) === null || _j === void 0 ? void 0 : _j.name} on ${node.name}: ${reason}`;
                errors.push(errorMsg);
                errorGroups.set(errorMsg, (errorGroups.get(errorMsg) || 0) + 1);
                console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
            }
        }
        catch (error) {
            errorCount++;
            const errorMsg = `Error swapping ${(_k = match.currentVariable) === null || _k === void 0 ? void 0 : _k.name}: ${error}`;
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
async function findNodeWithVariable(variableIdOrNodeId) {
    const selection = figma.currentPage.selection;
    if (selection.length === 0)
        return null;
    const selectedNode = selection[0];
    // If it's a nodeId (starts with "I:" or similar), search directly for node
    if (variableIdOrNodeId.startsWith('I:') || variableIdOrNodeId.startsWith('V:')) {
        return findNodeByIdRecursive(selectedNode, variableIdOrNodeId);
    }
    if (selectedNode.type === 'COMPONENT_SET') {
        // For ComponentSet, search in all variants
        return findNodeWithVariableInComponentSet(selectedNode, variableIdOrNodeId);
    }
    else {
        // For single component or instance
        return findNodeWithVariableRecursive(selectedNode, variableIdOrNodeId);
    }
}
// Search for node with variable in ComponentSet
function findNodeWithVariableInComponentSet(componentSet, variableId) {
    // Search in all variants
    for (const variant of componentSet.children) {
        if (variant.type === 'COMPONENT') {
            const found = findNodeWithVariableRecursive(variant, variableId);
            if (found)
                return found;
        }
    }
    return null;
}
// Search for node based on nodeId
function findNodeByIdRecursive(node, nodeId) {
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
            if (found)
                return found;
        }
    }
    return null;
}
// Recursive search for node with variable
function findNodeWithVariableRecursive(node, variableId) {
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
            if (found)
                return found;
        }
    }
    return null;
}
// Helper function to check if a variable is bound to a node
// This function handles different binding patterns and field types
async function checkIfVariableIsBoundToNode(node, variableId, field) {
    // Check boundVariables directly
    if ('boundVariables' in node && node.boundVariables) {
        // Special handling for text variables (stored as arrays)
        if (['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'].includes(field)) {
            if (field in node.boundVariables) {
                const boundVar = node.boundVariables[field];
                if (Array.isArray(boundVar) && boundVar.length > 0) {
                    const variableRef = boundVar[0];
                    if (variableRef && typeof variableRef === 'object' && variableRef.type === 'VARIABLE_ALIAS' && variableRef.id === variableId) {
                        return true;
                    }
                }
            }
        }
        else {
            // For other variables, check directly
            for (const [boundField, variableRef] of Object.entries(node.boundVariables)) {
                if (boundField === field && variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
                    if (variableRef.id === variableId) {
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
function hasColorVariable(node, variableId) {
    // Check boundVariables for fills and strokes (direct binding)
    if ('boundVariables' in node && node.boundVariables) {
        // Check fills
        if ('fills' in node.boundVariables && Array.isArray(node.boundVariables.fills)) {
            const fillsRefs = node.boundVariables.fills;
            for (const fillRef of fillsRefs) {
                if (fillRef && typeof fillRef === 'object' && 'type' in fillRef &&
                    fillRef.type === 'VARIABLE_ALIAS' && fillRef.id === variableId) {
                    return true;
                }
            }
        }
        // Check strokes
        if ('strokes' in node.boundVariables && Array.isArray(node.boundVariables.strokes)) {
            const strokesRefs = node.boundVariables.strokes;
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
                const colorValue = fill.color;
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
                const colorValue = stroke.color;
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
async function swapVariableOnNode(node, field, newVariable) {
    console.log(`[VARIABLE_SWAP_DEBUG] swapVariableOnNode: ${node.name}, field: ${field}, new variable: ${newVariable.name}`);
    if (!('boundVariables' in node)) {
        throw new Error('Node does not support variable binding');
    }
    // Handle different field types with specific binding patterns
    if (field === 'fills' || field === 'strokes') {
        console.log(`[VARIABLE_SWAP_DEBUG] Handling ${field} array`);
        // For fills and strokes we need to handle paint objects
        // Type casting required because Figma API doesn't expose fills/strokes on all node types
        const paints = field === 'fills' ? node.fills : node.strokes;
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
                node.fills = paintsCopy;
            }
            else {
                // Type casting required for strokes assignment
                node.strokes = paintsCopy;
            }
            console.log(`[VARIABLE_SWAP_DEBUG] ${field} array updated`);
        }
    }
    else if (field.startsWith('fills[') && field.endsWith(']')) {
        // Handle color variables in fills (direct binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Handling direct fills binding: ${field}`);
        const indexMatch = field.match(/fills\[(\d+)\]/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            // Type casting required for fills access
            const fills = node.fills;
            if (Array.isArray(fills) && fills[index]) {
                console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on fills[${index}]`);
                // Create a copy of the fills array before modification
                const fillsCopy = [...fills];
                // For direct binding, replace the entire fill object
                const newFill = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
                fillsCopy[index] = newFill;
                // Set the new array
                // Type casting required for fills assignment
                node.fills = fillsCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}] updated`);
            }
        }
    }
    else if (field.startsWith('strokes[') && field.endsWith(']')) {
        // Handle color variables in strokes (direct binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Handling direct strokes binding: ${field}`);
        const indexMatch = field.match(/strokes\[(\d+)\]/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            // Type casting required for strokes access
            const strokes = node.strokes;
            if (Array.isArray(strokes) && strokes[index]) {
                console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on strokes[${index}]`);
                // Create a copy of the strokes array before modification
                const strokesCopy = [...strokes];
                // For direct binding, replace the entire stroke object
                const newStroke = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
                strokesCopy[index] = newStroke;
                // Set the new array
                // Type casting required for strokes assignment
                node.strokes = strokesCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}] updated`);
            }
        }
    }
    else if (field.startsWith('fills[') && field.endsWith('].color')) {
        // Handle specific color variables in fills (indirect binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Handling indirect fills binding: ${field}`);
        const indexMatch = field.match(/fills\[(\d+)\]\.color/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            // Type casting required for fills access
            const fills = node.fills;
            if (Array.isArray(fills) && fills[index] && fills[index].type === 'SOLID') {
                console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on fills[${index}].color`);
                // Create a copy of the fills array before modification
                const fillsCopy = [...fills];
                const newPaint = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
                fillsCopy[index] = newPaint;
                // Set the new array
                // Type casting required for fills assignment
                node.fills = fillsCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}].color updated`);
            }
        }
    }
    else if (field.startsWith('strokes[') && field.endsWith('].color')) {
        // Handle specific color variables in strokes (indirect binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Handling indirect strokes binding: ${field}`);
        const indexMatch = field.match(/strokes\[(\d+)\]\.color/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            // Type casting required for strokes access
            const strokes = node.strokes;
            if (Array.isArray(strokes) && strokes[index] && strokes[index].type === 'SOLID') {
                console.log(`[VARIABLE_SWAP_DEBUG] Setting variable on strokes[${index}].color`);
                // Create a copy of the strokes array before modification
                const strokesCopy = [...strokes];
                const newPaint = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
                strokesCopy[index] = newPaint;
                // Set the new array
                // Type casting required for strokes assignment
                node.strokes = strokesCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}].color updated`);
            }
        }
    }
    else if (node.type === 'TEXT' && ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'].includes(field)) {
        // Handle text variables on TEXT nodes
        console.log(`[VARIABLE_SWAP_DEBUG] Handling text variable: ${field} on TEXT node`);
        const textNode = node;
        // Load font before modification (required for text variable binding)
        try {
            if (textNode.fontName === figma.mixed) {
                console.warn(`[VARIABLE_SWAP_DEBUG] Text has mixed fonts, cannot load font for ${field}`);
            }
            else {
                console.log(`[VARIABLE_SWAP_DEBUG] Loading font for ${field}: ${textNode.fontName.family} ${textNode.fontName.style}`);
                await figma.loadFontAsync(textNode.fontName);
                console.log(`[VARIABLE_SWAP_DEBUG] Font loaded for ${field}`);
            }
            // Use setBoundVariable for text variables (not direct assignment)
            console.log(`[VARIABLE_SWAP_DEBUG] Using setBoundVariable for text variable: ${field}`);
            textNode.setBoundVariable(field, newVariable);
            console.log(`[VARIABLE_SWAP_DEBUG] Text variable ${field} set to: ${newVariable.name}`);
        }
        catch (fontError) {
            console.warn(`[VARIABLE_SWAP_DEBUG] Could not load font for ${field} on ${textNode.name}:`, fontError);
            // Try to set variable anyway
            console.log(`[VARIABLE_SWAP_DEBUG] Using setBoundVariable for text variable: ${field} (without font-loading)`);
            textNode.setBoundVariable(field, newVariable);
            console.log(`[VARIABLE_SWAP_DEBUG] Text variable ${field} set to: ${newVariable.name} (without font-loading)`);
        }
    }
    else {
        // For other field types, use setBoundVariable
        console.log(`[VARIABLE_SWAP_DEBUG] Using setBoundVariable for field: ${field}`);
        node.setBoundVariable(field, newVariable);
        console.log(`[VARIABLE_SWAP_DEBUG] setBoundVariable completed for ${field}`);
    }
}
