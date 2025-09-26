"use strict";
// Simple Variable Swapper - Figma Plugin
// Denne pluginen hjelper brukere med å bytte variabler på importerte komponenter
// til å bruke lokale variabler i deres organisasjon
// Vis UI med størrelse og tema
figma.showUI(__html__, {
    width: 400,
    height: 600,
    themeColors: true
});
// Hovedmelding-håndterer
figma.ui.onmessage = async (msg) => {
    try {
        if (msg.type === 'analyze-selection') {
            await analyzeSelection();
        }
        else if (msg.type === 'swap-variables') {
            await swapVariables(msg.variableMatches || []);
        }
        else if (msg.type === 'cancel') {
            figma.closePlugin();
        }
    }
    catch (error) {
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
    const localVariableIdSet = new Set();
    localVariables.forEach(variable => {
        localVariableMap.set(variable.name, variable);
        localVariableIdSet.add(variable.id);
    });
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Fant ${localVariables.length} lokale variabler`);
    // Analyser komponenten for variabler
    const variableMatches = [];
    if (selectedNode.type === 'COMPONENT_SET') {
        // For ComponentSet, analyser alle varianter
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer ComponentSet med ${selectedNode.children.length} varianter`);
        await analyzeComponentSetForVariables(selectedNode, localVariableMap, localVariableIdSet, variableMatches);
    }
    else {
        // For enkelt komponent eller instans
        console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer enkelt komponent/instans`);
        await analyzeNodeForVariables(selectedNode, localVariableMap, localVariableIdSet, variableMatches);
    }
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyse fullført. Totalt ${variableMatches.length} variabler funnet`);
    // Send resultat til UI
    const result = {
        type: 'analysis-complete',
        variableMatches: variableMatches,
        componentName: selectedNode.name,
        componentType: selectedNode.type
    };
    // Legg til variantCount for ComponentSet
    if (selectedNode.type === 'COMPONENT_SET') {
        result.variantCount = selectedNode.children.length;
    }
    figma.ui.postMessage(result);
}
// Analyser ComponentSet for variabler (alle varianter)
async function analyzeComponentSetForVariables(componentSet, localVariableMap, localVariableIdSet, matches) {
    // Analyser hver variant i ComponentSet
    for (const variant of componentSet.children) {
        if (variant.type === 'COMPONENT') {
            console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer variant: ${variant.name}`);
            await analyzeNodeForVariables(variant, localVariableMap, localVariableIdSet, matches, variant.name);
        }
    }
}
// Analyser fargevariabler i fills og strokes
async function analyzeColorVariables(node, localVariableMap, localVariableIdSet, matches, variantName) {
    // Sjekk boundVariables for fills og strokes (direkte binding)
    const hasDirectFillsBinding = 'boundVariables' in node && node.boundVariables &&
        'fills' in node.boundVariables && Array.isArray(node.boundVariables.fills);
    const hasDirectStrokesBinding = 'boundVariables' in node && node.boundVariables &&
        'strokes' in node.boundVariables && Array.isArray(node.boundVariables.strokes);
    if (hasDirectFillsBinding) {
        // Sjekk fills (direkte binding)
        const fillsRefs = node.boundVariables.fills;
        for (let i = 0; i < fillsRefs.length; i++) {
            const fillRef = fillsRefs[i];
            if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && fillRef.type === 'VARIABLE_ALIAS') {
                const currentVariable = await figma.variables.getVariableByIdAsync(fillRef.id);
                if (currentVariable) {
                    // Søk etter lokal variabel med samme navn
                    const localVariable = localVariableMap.get(currentVariable.name);
                    // Hopp over hvis allerede koblet til lokal variabel (samme id)
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
        // Sjekk strokes (direkte binding)
        const strokesRefs = node.boundVariables.strokes;
        for (let i = 0; i < strokesRefs.length; i++) {
            const strokeRef = strokesRefs[i];
            if (strokeRef && typeof strokeRef === 'object' && 'type' in strokeRef && strokeRef.type === 'VARIABLE_ALIAS') {
                const currentVariable = await figma.variables.getVariableByIdAsync(strokeRef.id);
                if (currentVariable) {
                    const localVariable = localVariableMap.get(currentVariable.name);
                    // Hopp over hvis allerede koblet til lokal variabel (samme id)
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
    // Sjekk fargevariabler i paint-objekter (indirekte binding) - kun hvis ikke direkte binding
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
    // Sjekk fargevariabler i stroke-objekter (indirekte binding) - kun hvis ikke direkte binding
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
// Rekursivt analyser node for variabler
async function analyzeNodeForVariables(node, localVariableMap, localVariableIdSet, matches, variantName) {
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Analyserer node: ${node.name} (${node.type})${variantName ? ` i variant: ${variantName}` : ''}`);
    // Analyser boundVariables
    if ('boundVariables' in node && node.boundVariables) {
        // Debug: Log boundVariables for å se strukturen
        console.log(`[DEBUG] boundVariables for ${node.name}:`, JSON.stringify(node.boundVariables, null, 2));
        for (const [field, variableRef] of Object.entries(node.boundVariables)) {
            if (variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
                const currentVariable = await figma.variables.getVariableByIdAsync(variableRef.id);
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
    // Spesiell håndtering for fargevariabler i fills og strokes
    await analyzeColorVariables(node, localVariableMap, localVariableIdSet, matches, variantName);
    // Fjern duplikater basert på variabel-ID, men inkluder variantName i nøkkelen
    console.log(`[VARIABLE_ANALYSIS_DEBUG] Før deduplisering: ${matches.length} matches`);
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
            await analyzeNodeForVariables(child, localVariableMap, localVariableIdSet, matches);
        }
    }
}
// Bytt variabler basert på matches
async function swapVariables(variableMatches) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    console.log(`[VARIABLE_SWAP_DEBUG] Starter bytting av ${variableMatches.length} variabler`);
    for (const match of variableMatches) {
        console.log(`[VARIABLE_SWAP_DEBUG] Behandler variabel: ${(_a = match.currentVariable) === null || _a === void 0 ? void 0 : _a.name} (${(_b = match.currentVariable) === null || _b === void 0 ? void 0 : _b.id}) på felt: ${match.field}`);
        if (!match.localVariable) {
            errorCount++;
            const errorMsg = `Ingen lokal variabel funnet for: ${(_c = match.currentVariable) === null || _c === void 0 ? void 0 : _c.name}`;
            errors.push(errorMsg);
            console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
            continue;
        }
        try {
            // Finn noden som har denne variabelen
            console.log(`[VARIABLE_SWAP_DEBUG] Søker etter node med variabel ID: ${(_d = match.currentVariable) === null || _d === void 0 ? void 0 : _d.id}`);
            const node = await findNodeWithVariable(((_e = match.currentVariable) === null || _e === void 0 ? void 0 : _e.id) || '');
            if (!node) {
                errorCount++;
                const errorMsg = `Kunne ikke finne node for variabel: ${(_f = match.currentVariable) === null || _f === void 0 ? void 0 : _f.name}`;
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
            const isCurrentlyBound = await checkIfVariableIsBoundToNode(node, ((_g = match.currentVariable) === null || _g === void 0 ? void 0 : _g.id) || '', match.field);
            console.log(`[VARIABLE_SWAP_DEBUG] Variabel koblet til node: ${isCurrentlyBound}`);
            if (!isCurrentlyBound) {
                console.log(`[VARIABLE_SWAP_DEBUG] ADVARSEL: Variabel ${(_h = match.currentVariable) === null || _h === void 0 ? void 0 : _h.name} er ikke lenger koblet til node ${node.name}`);
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
                console.log(`[VARIABLE_SWAP_DEBUG] SUKSESS: Variabel byttet fra ${(_j = match.currentVariable) === null || _j === void 0 ? void 0 : _j.name} til ${localVariable.name}`);
            }
            else {
                errorCount++;
                const errorMsg = `Bytting feilet for ${(_k = match.currentVariable) === null || _k === void 0 ? void 0 : _k.name}: Variabel ble ikke koblet til node`;
                errors.push(errorMsg);
                console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
            }
        }
        catch (error) {
            errorCount++;
            const errorMsg = `Feil ved bytting av ${(_l = match.currentVariable) === null || _l === void 0 ? void 0 : _l.name}: ${error}`;
            errors.push(errorMsg);
            console.log(`[VARIABLE_SWAP_DEBUG] FEIL: ${errorMsg}`);
        }
    }
    console.log(`[VARIABLE_SWAP_DEBUG] Bytting fullført: ${successCount} suksess, ${errorCount} feil`);
    // Send resultat til UI
    figma.ui.postMessage({
        type: 'swap-complete',
        successCount: successCount,
        errorCount: errorCount,
        errors: errors
    });
}
// Finn node som har en spesifikk variabel
async function findNodeWithVariable(variableId) {
    const selection = figma.currentPage.selection;
    if (selection.length === 0)
        return null;
    const selectedNode = selection[0];
    if (selectedNode.type === 'COMPONENT_SET') {
        // For ComponentSet, søk i alle varianter
        return findNodeWithVariableInComponentSet(selectedNode, variableId);
    }
    else {
        // For enkelt komponent eller instans
        return findNodeWithVariableRecursive(selectedNode, variableId);
    }
}
// Søk etter node med variabel i ComponentSet
function findNodeWithVariableInComponentSet(componentSet, variableId) {
    // Søk i alle varianter
    for (const variant of componentSet.children) {
        if (variant.type === 'COMPONENT') {
            const found = findNodeWithVariableRecursive(variant, variableId);
            if (found)
                return found;
        }
    }
    return null;
}
// Rekursivt søk etter node med variabel
function findNodeWithVariableRecursive(node, variableId) {
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
            if (found)
                return found;
        }
    }
    return null;
}
// Hjelpefunksjon for å sjekke om en variabel er koblet til en node
async function checkIfVariableIsBoundToNode(node, variableId, field) {
    // Sjekk boundVariables direkte
    if ('boundVariables' in node && node.boundVariables) {
        for (const [boundField, variableRef] of Object.entries(node.boundVariables)) {
            if (boundField === field && variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
                if (variableRef.id === variableId) {
                    return true;
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
function hasColorVariable(node, variableId) {
    // Sjekk boundVariables for fills og strokes (direkte binding)
    if ('boundVariables' in node && node.boundVariables) {
        // Sjekk fills
        if ('fills' in node.boundVariables && Array.isArray(node.boundVariables.fills)) {
            const fillsRefs = node.boundVariables.fills;
            for (const fillRef of fillsRefs) {
                if (fillRef && typeof fillRef === 'object' && 'type' in fillRef &&
                    fillRef.type === 'VARIABLE_ALIAS' && fillRef.id === variableId) {
                    return true;
                }
            }
        }
        // Sjekk strokes
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
    // Sjekk fargevariabler i paint-objekter (indirekte binding)
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
    // Sjekk fargevariabler i stroke-objekter (indirekte binding)
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
// Bytt variabel på en node
async function swapVariableOnNode(node, field, newVariable) {
    console.log(`[VARIABLE_SWAP_DEBUG] swapVariableOnNode: ${node.name}, felt: ${field}, ny variabel: ${newVariable.name}`);
    if (!('boundVariables' in node)) {
        throw new Error('Node støtter ikke variabel-binding');
    }
    // Spesiell håndtering for ulike felttyper
    if (field === 'fills' || field === 'strokes') {
        console.log(`[VARIABLE_SWAP_DEBUG] Håndterer ${field} array`);
        // For fills og strokes må vi håndtere paint-objekter
        const paints = field === 'fills' ? node.fills : node.strokes;
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
                node.fills = paintsCopy;
            }
            else {
                node.strokes = paintsCopy;
            }
            console.log(`[VARIABLE_SWAP_DEBUG] ${field} array oppdatert`);
        }
    }
    else if (field.startsWith('fills[') && field.endsWith(']')) {
        // Håndter fargevariabler i fills (direkte binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Håndterer direkte fills binding: ${field}`);
        const indexMatch = field.match(/fills\[(\d+)\]/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const fills = node.fills;
            if (Array.isArray(fills) && fills[index]) {
                console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på fills[${index}]`);
                // Lag en kopi av fills-arrayen før endring
                const fillsCopy = [...fills];
                // For direkte binding, erstatt hele fill-objektet
                const newFill = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
                fillsCopy[index] = newFill;
                // Sett den nye arrayen
                node.fills = fillsCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}] oppdatert`);
            }
        }
    }
    else if (field.startsWith('strokes[') && field.endsWith(']')) {
        // Håndter fargevariabler i strokes (direkte binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Håndterer direkte strokes binding: ${field}`);
        const indexMatch = field.match(/strokes\[(\d+)\]/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const strokes = node.strokes;
            if (Array.isArray(strokes) && strokes[index]) {
                console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på strokes[${index}]`);
                // Lag en kopi av strokes-arrayen før endring
                const strokesCopy = [...strokes];
                // For direkte binding, erstatt hele stroke-objektet
                const newStroke = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
                strokesCopy[index] = newStroke;
                // Sett den nye arrayen
                node.strokes = strokesCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}] oppdatert`);
            }
        }
    }
    else if (field.startsWith('fills[') && field.endsWith('].color')) {
        // Håndter spesifikke fargevariabler i fills (indirekte binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Håndterer indirekte fills binding: ${field}`);
        const indexMatch = field.match(/fills\[(\d+)\]\.color/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const fills = node.fills;
            if (Array.isArray(fills) && fills[index] && fills[index].type === 'SOLID') {
                console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på fills[${index}].color`);
                // Lag en kopi av fills-arrayen før endring
                const fillsCopy = [...fills];
                const newPaint = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
                fillsCopy[index] = newPaint;
                // Sett den nye arrayen
                node.fills = fillsCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] fills[${index}].color oppdatert`);
            }
        }
    }
    else if (field.startsWith('strokes[') && field.endsWith('].color')) {
        // Håndter spesifikke fargevariabler i strokes (indirekte binding)
        console.log(`[VARIABLE_SWAP_DEBUG] Håndterer indirekte strokes binding: ${field}`);
        const indexMatch = field.match(/strokes\[(\d+)\]\.color/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const strokes = node.strokes;
            if (Array.isArray(strokes) && strokes[index] && strokes[index].type === 'SOLID') {
                console.log(`[VARIABLE_SWAP_DEBUG] Setter variabel på strokes[${index}].color`);
                // Lag en kopi av strokes-arrayen før endring
                const strokesCopy = [...strokes];
                const newPaint = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
                strokesCopy[index] = newPaint;
                // Sett den nye arrayen
                node.strokes = strokesCopy;
                console.log(`[VARIABLE_SWAP_DEBUG] strokes[${index}].color oppdatert`);
            }
        }
    }
    else {
        // For andre felttyper, bruk setBoundVariable
        console.log(`[VARIABLE_SWAP_DEBUG] Bruker setBoundVariable for felt: ${field}`);
        node.setBoundVariable(field, newVariable);
        console.log(`[VARIABLE_SWAP_DEBUG] setBoundVariable fullført for ${field}`);
    }
}
