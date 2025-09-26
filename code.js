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
    // Analyser komponenten for variabler
    const variableMatches = [];
    if (selectedNode.type === 'COMPONENT_SET') {
        // For ComponentSet, analyser alle varianter
        await analyzeComponentSetForVariables(selectedNode, localVariableMap, localVariableIdSet, variableMatches);
    }
    else {
        // For enkelt komponent eller instans
        await analyzeNodeForVariables(selectedNode, localVariableMap, localVariableIdSet, variableMatches);
    }
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
                    // Hopp over hvis allerede koblet til lokal variabel (samme id)
                    if (localVariableIdSet.has(currentVariable.id))
                        continue;
                    const localVariable = localVariableMap.get(currentVariable.name);
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
                        variantName: variantName
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
                    if (localVariableIdSet.has(currentVariable.id))
                        continue;
                    const localVariable = localVariableMap.get(currentVariable.name);
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
                        variantName: variantName
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
                            variantName: variantName
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
                            variantName: variantName
                        });
                    }
                }
            }
        }
    }
}
// Rekursivt analyser node for variabler
async function analyzeNodeForVariables(node, localVariableMap, localVariableIdSet, matches, variantName) {
    // Analyser boundVariables
    if ('boundVariables' in node && node.boundVariables) {
        // Debug: Log boundVariables for å se strukturen
        console.log(`[DEBUG] boundVariables for ${node.name}:`, JSON.stringify(node.boundVariables, null, 2));
        for (const [field, variableRef] of Object.entries(node.boundVariables)) {
            if (variableRef && typeof variableRef === 'object' && 'id' in variableRef) {
                const currentVariable = await figma.variables.getVariableByIdAsync(variableRef.id);
                if (currentVariable) {
                    // Hopp over hvis allerede lokal (id finnes i lokale)
                    if (localVariableIdSet.has(currentVariable.id))
                        continue;
                    // Søk etter lokal variabel med samme navn
                    const localVariable = localVariableMap.get(currentVariable.name);
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
                        variantName: variantName
                    });
                }
            }
        }
    }
    // Spesiell håndtering for fargevariabler i fills og strokes
    await analyzeColorVariables(node, localVariableMap, localVariableIdSet, matches, variantName);
    // Fjern duplikater basert på variabel-ID
    const uniqueMatches = [];
    const seenVariableIds = new Set();
    for (const match of matches) {
        if (match.currentVariable) {
            const key = `${match.currentVariable.id}-${match.nodeName}-${match.field}`;
            if (!seenVariableIds.has(key)) {
                seenVariableIds.add(key);
                uniqueMatches.push(match);
            }
        }
        else {
            // Hvis ingen currentVariable, legg til uansett
            uniqueMatches.push(match);
        }
    }
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
    var _a, _b, _c, _d;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    for (const match of variableMatches) {
        if (!match.localVariable) {
            errorCount++;
            errors.push(`Ingen lokal variabel funnet for: ${(_a = match.currentVariable) === null || _a === void 0 ? void 0 : _a.name}`);
            continue;
        }
        try {
            // Finn noden som har denne variabelen
            const node = await findNodeWithVariable(((_b = match.currentVariable) === null || _b === void 0 ? void 0 : _b.id) || '');
            if (!node) {
                errorCount++;
                errors.push(`Kunne ikke finne node for variabel: ${(_c = match.currentVariable) === null || _c === void 0 ? void 0 : _c.name}`);
                continue;
            }
            // Hent den lokale variabelen
            const localVariable = await figma.variables.getVariableByIdAsync(match.localVariable.id);
            if (!localVariable) {
                errorCount++;
                errors.push(`Kunne ikke hente lokal variabel: ${match.localVariable.name}`);
                continue;
            }
            // Skipp hvis allerede samme id (allerede koblet til lokal variabel)
            if (match.currentVariable && localVariable.id === match.currentVariable.id) {
                continue;
            }
            // Bytt variabelen
            await swapVariableOnNode(node, match.field, localVariable);
            successCount++;
        }
        catch (error) {
            errorCount++;
            errors.push(`Feil ved bytting av ${(_d = match.currentVariable) === null || _d === void 0 ? void 0 : _d.name}: ${error}`);
        }
    }
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
    if (!('boundVariables' in node)) {
        throw new Error('Node støtter ikke variabel-binding');
    }
    // Spesiell håndtering for ulike felttyper
    if (field === 'fills' || field === 'strokes') {
        // For fills og strokes må vi håndtere paint-objekter
        const paints = field === 'fills' ? node.fills : node.strokes;
        if (Array.isArray(paints)) {
            // Lag en kopi av paints-arrayen før endring
            const paintsCopy = [...paints];
            for (let i = 0; i < paintsCopy.length; i++) {
                const paint = paintsCopy[i];
                if (paint && paint.type === 'SOLID') {
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
        }
    }
    else if (field.startsWith('fills[') && field.endsWith(']')) {
        // Håndter fargevariabler i fills (direkte binding)
        const indexMatch = field.match(/fills\[(\d+)\]/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const fills = node.fills;
            if (Array.isArray(fills) && fills[index]) {
                // Lag en kopi av fills-arrayen før endring
                const fillsCopy = [...fills];
                // For direkte binding, erstatt hele fill-objektet
                const newFill = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
                fillsCopy[index] = newFill;
                // Sett den nye arrayen
                node.fills = fillsCopy;
            }
        }
    }
    else if (field.startsWith('strokes[') && field.endsWith(']')) {
        // Håndter fargevariabler i strokes (direkte binding)
        const indexMatch = field.match(/strokes\[(\d+)\]/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const strokes = node.strokes;
            if (Array.isArray(strokes) && strokes[index]) {
                // Lag en kopi av strokes-arrayen før endring
                const strokesCopy = [...strokes];
                // For direkte binding, erstatt hele stroke-objektet
                const newStroke = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
                strokesCopy[index] = newStroke;
                // Sett den nye arrayen
                node.strokes = strokesCopy;
            }
        }
    }
    else if (field.startsWith('fills[') && field.endsWith('].color')) {
        // Håndter spesifikke fargevariabler i fills (indirekte binding)
        const indexMatch = field.match(/fills\[(\d+)\]\.color/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const fills = node.fills;
            if (Array.isArray(fills) && fills[index] && fills[index].type === 'SOLID') {
                // Lag en kopi av fills-arrayen før endring
                const fillsCopy = [...fills];
                const newPaint = figma.variables.setBoundVariableForPaint(fillsCopy[index], 'color', newVariable);
                fillsCopy[index] = newPaint;
                // Sett den nye arrayen
                node.fills = fillsCopy;
            }
        }
    }
    else if (field.startsWith('strokes[') && field.endsWith('].color')) {
        // Håndter spesifikke fargevariabler i strokes (indirekte binding)
        const indexMatch = field.match(/strokes\[(\d+)\]\.color/);
        if (indexMatch) {
            const index = parseInt(indexMatch[1]);
            const strokes = node.strokes;
            if (Array.isArray(strokes) && strokes[index] && strokes[index].type === 'SOLID') {
                // Lag en kopi av strokes-arrayen før endring
                const strokesCopy = [...strokes];
                const newPaint = figma.variables.setBoundVariableForPaint(strokesCopy[index], 'color', newVariable);
                strokesCopy[index] = newPaint;
                // Sett den nye arrayen
                node.strokes = strokesCopy;
            }
        }
    }
    else {
        // For andre felttyper, bruk setBoundVariable
        node.setBoundVariable(field, newVariable);
    }
}
