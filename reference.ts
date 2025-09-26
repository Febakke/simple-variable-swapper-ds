
// REFERENCE FILE - NOT USED IN THIS PLUGIN
// This file contains reference code from a previous plugin implementation
// and is commented out to avoid conflicts with the current plugin.

/*
// This shows the HTML page in "ui.html".
figma.showUI(__html__ ,{ width: 400, height: 600, themeColors: true });

// Calls to "parent.postMessage" from within the HTML page will trigger this
// callback. The callback will be passed the "pluginMessage" property of the
// posted message.
// Importer nødvendige typer fra Figma Plugin API
type PluginMessage = { type: string; count?: number; referenceProfile?: any };

figma.ui.onmessage = async (msg: PluginMessage) => {
  // Hjelpefunksjon for å finne subkomponenter (instanser)
  function findSubcomponents(node: SceneNode): string[] {
    const subcomponents: string[] = [];
    if ('children' in node) {
      for (const child of node.children as SceneNode[]) {
        if (child.type === 'INSTANCE') {
          subcomponents.push(child.name);
        }
        if ('children' in child) {
          subcomponents.push(...findSubcomponents(child));
        }
      }
    }
    return subcomponents;
  }

  // Type-guard for å sjekke om node er InstanceNode med getOverriddenFields
  function isInstanceNode(node: SceneNode): node is InstanceNode {
    return node.type === 'INSTANCE' && typeof (node as any).getOverriddenFields === 'function';
  }

  // Hjelpefunksjon for å hente alle overstyrte felter fra InstanceNode.overrides, returnerer et map fra id til array av felter
  function getOverridesMapFromInstance(node: SceneNode): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    if ('overrides' in node && Array.isArray((node as any).overrides)) {
      for (const o of (node as any).overrides) {
        if (o.id && Array.isArray(o.overriddenFields)) {
          map[o.id] = o.overriddenFields;
        }
      }
    }
    return map;
  }

  // Hjelpefunksjoner for ny tilnærming (JSON som source of truth)
  
  // Hent master-verdi for et felt fra master-komponenten
  async function getMasterValue(masterComponent: ComponentNode, field: string): Promise<any> {
    // Rekursivt søk i master-komponenten for å finne verdien
    // Dette er en forenklet implementering - kan utvides senere
    console.log(`[getMasterValue] Søker etter ${field} i master-komponent ${masterComponent.name}`);
    
    // For nå, returner undefined (ingen master-verdi funnet)
    // TODO: Implementer full rekursiv søk i master-komponenten
    return undefined;
  }
  
  // Hent verdi fra nested objekt basert på path (f.eks. "boundVariables/fills")
  function getNestedValue(obj: any, path: string): any {
    const keys = path.split('/');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }
    
    return current;
  }

  // Sjekk om nested verdi eksisterer
  function hasNestedValue(obj: any, path: string): boolean {
    return getNestedValue(obj, path) !== undefined;
  }

  // Sammenlign to verdier dypt (håndterer objekter og arrays)
  function deepCompare(obj1: any, obj2: any): boolean {
    if (typeof obj1 !== typeof obj2) return false;
    if (obj1 === null || obj2 === null) return obj1 === obj2;
    if (typeof obj1 !== 'object') return obj1 === obj2;
    
    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;
    
    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) return false;
      for (let i = 0; i < obj1.length; i++) {
        if (!deepCompare(obj1[i], obj2[i])) return false;
      }
      return true;
    }
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!deepCompare(obj1[key], obj2[key])) return false;
    }
    
    return true;
  }

  // Hjelpefunksjon for å normalisere strokeWeight-data
  function normalizeStrokeWeight(strokeWeight: any): any {
    if (strokeWeight === undefined || strokeWeight === null) return null;
    
    // Hvis det er et objekt med individuelle sider
    if (typeof strokeWeight === 'object' && strokeWeight !== null) {
      const normalized: any = {};
      if ('strokeTopWeight' in strokeWeight) normalized.strokeTopWeight = strokeWeight.strokeTopWeight;
      if ('strokeBottomWeight' in strokeWeight) normalized.strokeBottomWeight = strokeWeight.strokeBottomWeight;
      if ('strokeLeftWeight' in strokeWeight) normalized.strokeLeftWeight = strokeWeight.strokeLeftWeight;
      if ('strokeRightWeight' in strokeWeight) normalized.strokeRightWeight = strokeWeight.strokeRightWeight;
      return Object.keys(normalized).length > 0 ? normalized : null;
    }
    
    // Enkelt strokeWeight-verdi
    return strokeWeight;
  }

  // Hjelpefunksjon for å sjekke om strokeWeight er mixed
  function isStrokeWeightMixed(node: SceneNode): boolean {
    return 'strokeWeight' in node && node.strokeWeight === figma.mixed;
  }

  // Hjelpefunksjon for å håndtere strokeWeight-ekstraksjon
  async function extractStrokeWeight(node: SceneNode): Promise<any> {
    // Sjekk om node har strokeWeight-egenskap
    if ('strokeWeight' in node) {
      const strokeWeight = node.strokeWeight;
      
      if (strokeWeight === figma.mixed) {
        // Case 2: Ulike strokeWeight på forskjellige sider
        const strokeWeightInfo: any = {};
        
        // Sjekk hvilke sider som har variabel-bindinger
        const hasVariableBinding = (side: string) => {
          return node.boundVariables && 
                 (node.boundVariables as any)[side] && 
                 (node.boundVariables as any)[side].type === 'VARIABLE_ALIAS';
        };
        
        // Kun inkluder råverdier for sider som IKKE har variabel-bindinger
        if ('strokeTopWeight' in node && !hasVariableBinding('strokeTopWeight')) {
          strokeWeightInfo.strokeTopWeight = node.strokeTopWeight;
        }
        if ('strokeBottomWeight' in node && !hasVariableBinding('strokeBottomWeight')) {
          strokeWeightInfo.strokeBottomWeight = node.strokeBottomWeight;
        }
        if ('strokeLeftWeight' in node && !hasVariableBinding('strokeLeftWeight')) {
          strokeWeightInfo.strokeLeftWeight = node.strokeLeftWeight;
        }
        if ('strokeRightWeight' in node && !hasVariableBinding('strokeRightWeight')) {
          strokeWeightInfo.strokeRightWeight = node.strokeRightWeight;
        }
        
        return strokeWeightInfo;
      } else {
        // Case 1: Samme strokeWeight på alle sider
        // Sjekk om strokeWeight har variabel-binding
        if (node.boundVariables && 
            (node.boundVariables as any).strokeWeight && 
            (node.boundVariables as any).strokeWeight.type === 'VARIABLE_ALIAS') {
          // Har variabel-binding - ikke inkluder råverdi
          return null;
        }
        
        // Sjekk om alle individuelle sider har variabel-bindinger
        const hasVariableBinding = (side: string) => {
          return node.boundVariables && 
                 (node.boundVariables as any)[side] && 
                 (node.boundVariables as any)[side].type === 'VARIABLE_ALIAS';
        };
        
        // Hvis alle sider har variabel-bindinger, ikke inkluder råverdi
        if (hasVariableBinding('strokeTopWeight') && 
            hasVariableBinding('strokeBottomWeight') && 
            hasVariableBinding('strokeLeftWeight') && 
            hasVariableBinding('strokeRightWeight')) {
          return null;
        }
        
        return strokeWeight;
      }
    }
    
    return null;
  }

  // Hent alle mulige override-felter for en node
  function getAllPossibleOverrideFields(node: SceneNode): string[] {
    const fields = [
      'constraints',
      'fills',
      'strokes',
      'strokeWeight',
      'characters',
      'textStyleId',
      'textProperties',
      'autolayout'
    ];
    
    // Legg til nested felter basert på node-type
    const nestedFields = [
      // BoundVariables (alle mulige)
      'boundVariables/fills',
      'boundVariables/strokes',
      'boundVariables/strokeWeight',
      'boundVariables/strokeTopWeight',
      'boundVariables/strokeBottomWeight',
      'boundVariables/strokeLeftWeight',
      'boundVariables/strokeRightWeight',
      'boundVariables/width',
      'boundVariables/height',
      'boundVariables/topLeftRadius',
      'boundVariables/topRightRadius',
      'boundVariables/bottomLeftRadius',
      'boundVariables/bottomRightRadius',
      'boundVariables/fontSize',
      'boundVariables/fontFamily',
      'boundVariables/fontStyle',
      'boundVariables/fontWeight',
      'boundVariables/lineHeight',
      'boundVariables/letterSpacing',
      'boundVariables/textCase',
      'boundVariables/textDecoration',
      
      // Autolayout
      'autolayout/layoutMode',
      'autolayout/primaryAxisAlignItems',
      'autolayout/counterAxisAlignItems',
      'autolayout/itemSpacing',
      'autolayout/paddingLeft',
      'autolayout/paddingRight',
      'autolayout/paddingTop',
      'autolayout/paddingBottom',
      'autolayout/layoutWrap',
      'autolayout/primaryAxisSizingMode',
      'autolayout/counterAxisSizingMode',
      'autolayout/strokesIncludedInLayout',
      'autolayout/counterAxisAlignContent',
      'autolayout/itemReverseZIndex',
      'autolayout/layoutPositioning',
      'autolayout/layoutGrow',
      'autolayout/layoutAlign',
      'autolayout/counterAxisSpacing',
      
      // TextProperties
      'textProperties/fontSize',
      'textProperties/fontFamily',
      'textProperties/fontStyle',
      'textProperties/fontWeight',
      'textProperties/lineHeight',
      'textProperties/letterSpacing',
      'textProperties/textCase',
      'textProperties/textDecoration'
    ];
    
    return [...fields, ...nestedFields];
  }

  // Hovedlogikk for ny tilnærming (JSON som source of truth)
  
  // Finn forskjeller mellom Figma-node og JSON-data
  async function findDifferences(instance: SceneNode, jsonData: any): Promise<any[]> {
    const currentData = await extractNodeRecursive(instance);
    const differences = [];
    const allPossibleFields = getAllPossibleOverrideFields(instance);
    
    console.log(`[TEXT_DEBUG] 🔍 findDifferences: Sammenligner ${instance.name} (${instance.id}) med JSON-data`);
    console.log(`[TEXT_DEBUG] 📋 findDifferences: Alle mulige felter:`, allPossibleFields);
    console.log(`[TEXT_DEBUG] 📊 findDifferences: currentData:`, currentData);
    console.log(`[TEXT_DEBUG] 📄 findDifferences: jsonData:`, jsonData);
    
    for (const field of allPossibleFields) {
      const currentValue = getNestedValue(currentData, field);
      const jsonValue = getNestedValue(jsonData, field);
      
      console.log(`[TEXT_DEBUG] 🔍 findDifferences: Sjekker felt: ${field}`);
      console.log(`[TEXT_DEBUG] 📊 findDifferences: Current value:`, currentValue);
      console.log(`[TEXT_DEBUG] 📄 findDifferences: JSON value:`, jsonValue);
      
      // Spesiell debugging for characters feltet
      if (field === 'characters') {
        console.log(`[TEXT_DEBUG] 📝 findDifferences: Characters felt funnet!`);
        console.log(`[TEXT_DEBUG] 📝 findDifferences: currentValue: "${currentValue}"`);
        console.log(`[TEXT_DEBUG] 📝 findDifferences: jsonValue: "${jsonValue}"`);
        console.log(`[TEXT_DEBUG] 📝 findDifferences: hasNestedValue(jsonData, field): ${hasNestedValue(jsonData, field)}`);
        console.log(`[TEXT_DEBUG] 📝 findDifferences: deepCompare(currentValue, jsonValue): ${deepCompare(currentValue, jsonValue)}`);
      }
      
      // Scenario A: JSON har feltet, men verdien er forskjellig
      if (hasNestedValue(jsonData, field) && !deepCompare(currentValue, jsonValue)) {
        console.log(`[TEXT_DEBUG] 🔍 findDifferences: Forskjell funnet for ${field} - JSON har feltet men verdien er forskjellig`);
        
        // Spesiell håndtering for instanser med overstyringer
        if (instance.type === 'INSTANCE') {
          const instanceNode = instance as InstanceNode;
          const overrides = instanceNode.overrides || [];
          console.log(`[TEXT_DEBUG] 📋 findDifferences: Instans ${instance.name} har ${overrides.length} overrides:`, overrides);
          
          const hasOverride = overrides.some(override => 
            override.overriddenFields.includes(field as any)
          );
          
          if (hasOverride) {
            console.log(`[TEXT_DEBUG] ✅ findDifferences: Felt ${field} er overstyrt på instans ${instance.name}`);
            
            // Sjekk om JSON-verdien er identisk med master-komponentens verdi
            const masterComponent = instanceNode.mainComponent;
            if (masterComponent) {
              console.log(`[TEXT_DEBUG] ✅ findDifferences: Instans ${instance.name} har master-komponent: ${masterComponent.name}`);
              
              // Reset alle overstyringer på instanser - fjernet "Default" sjekk
              differences.push({ 
                field, 
                action: 'reset', 
                currentValue,
                jsonValue,
                reason: 'instance_override_reset'
              });
              console.log(`[TEXT_DEBUG] 🔄 findDifferences: Reset nødvendig for ${field} (instans overstyring):`, { currentValue, jsonValue });
            } else {
              console.log(`[TEXT_DEBUG] ⚠️ findDifferences: Instans ${instance.name} har INGEN master-komponent`);
              // Ingen master-komponent - oppdater som vanlig
              differences.push({ 
                field, 
                action: 'update', 
                currentValue,
                jsonValue,
                reason: 'value_different_no_master'
              });
              console.log(`[TEXT_DEBUG] 📝 findDifferences: Forskjell funnet for ${field}:`, { currentValue, jsonValue });
            }
          } else {
            console.log(`[TEXT_DEBUG] ℹ️ findDifferences: Felt ${field} er IKKE overstyrt på instans ${instance.name}`);
            // Ikke overstyrt - oppdater som vanlig
            differences.push({ 
              field, 
              action: 'update', 
              currentValue,
              jsonValue,
              reason: 'value_different_not_overridden'
            });
            console.log(`[TEXT_DEBUG] 📝 findDifferences: Forskjell funnet for ${field}:`, { currentValue, jsonValue });
          }
        } else {
          // Ikke en instans - oppdater som vanlig
          differences.push({ 
            field, 
            action: 'update', 
            currentValue,
            jsonValue,
            reason: 'value_different'
          });
          console.log(`[TEXT_DEBUG] 📝 findDifferences: Forskjell funnet for ${field}:`, { currentValue, jsonValue });
        }
      }
      
      // Scenario B: JSON har IKKE feltet, men Figma har en verdi (må resettes)
      if (!hasNestedValue(jsonData, field) && currentValue !== undefined) {
        // For instanser, sjekk om dette er en overstyring som bør resettes
        if (instance.type === 'INSTANCE') {
          const instanceNode = instance as InstanceNode;
          const overrides = instanceNode.overrides || [];
          const hasOverride = overrides.some(override => 
            override.overriddenFields.includes(field as any)
          );
          
          if (hasOverride) {
            differences.push({ 
              field, 
              action: 'reset', 
              currentValue,
              jsonValue: null,
              reason: 'not_in_json_but_overridden'
            });
            console.log(`[TEXT_DEBUG] 🔄 findDifferences: Reset nødvendig for overstyring ${field}:`, { currentValue });
          }
        } else {
          differences.push({ 
            field, 
            action: 'reset', 
            currentValue,
            jsonValue: null,
            reason: 'not_in_json'
          });
          console.log(`[TEXT_DEBUG] 🔄 findDifferences: Reset nødvendig for ${field}:`, { currentValue });
        }
      }
    }
    
    console.log(`[TEXT_DEBUG] 📊 findDifferences: Totalt ${differences.length} forskjeller funnet:`, differences);
    return differences;
  }

  // Oppdater node basert på forskjeller
  async function applyDifferences(instance: SceneNode, differences: any[]): Promise<void> {
    console.log(`[INSTANCE_DEBUG] 🚀 applyDifferences: Starter oppdatering av ${instance.name} (${instance.id})`);
    console.log(`[INSTANCE_DEBUG] 📊 applyDifferences: Totalt ${differences.length} forskjeller å behandle:`, differences);
    
    for (const diff of differences) {
      console.log(`[INSTANCE_DEBUG] 🔧 applyDifferences: Behandler ${diff.action} for ${diff.field} (reason: ${diff.reason}):`, diff);
      
      if (diff.action === 'update') {
        console.log(`[INSTANCE_DEBUG] 📝 applyDifferences: Kaller updateField() for ${diff.field}`);
        await updateField(instance, diff.field, diff.jsonValue);
      } else if (diff.action === 'reset') {
        console.log(`[INSTANCE_DEBUG] 🔄 applyDifferences: Kaller resetFieldToMaster() for ${diff.field}`);
        await resetFieldToMaster(instance, diff.field);
      }
    }
    
    console.log(`[INSTANCE_DEBUG] ✅ applyDifferences: Ferdig med oppdatering av ${instance.name}`);
  }

  // Oppdater spesifikt felt
  async function updateField(instance: SceneNode, field: string, value: any): Promise<void> {
    console.log(`[TEXT_DEBUG] 🚀 updateField: Starter oppdatering av ${field} på ${instance.name} (type: ${instance.type})`);
    console.log(`[TEXT_DEBUG] 📊 updateField: Verdi som skal settes:`, value);
    
    try {
      if (field === 'constraints') {
        if ('constraints' in instance) {
          (instance as any).constraints = {
            horizontal: value.horizontal,
            vertical: value.vertical
          };
        }
      } else if (field === 'characters') {
        console.log(`[TEXT_DEBUG] 📝 updateField: Oppdaterer characters på ${instance.name}`);
        if (instance.type === 'TEXT') {
          const textNode = instance as TextNode;
          console.log(`[TEXT_DEBUG] 📝 updateField: Dette er en TEXT-node, setter characters direkte`);
          console.log(`[TEXT_DEBUG] 📝 updateField: Gammel characters: "${textNode.characters}"`);
          console.log(`[TEXT_DEBUG] 📝 updateField: Ny characters: "${value}"`);
          
          // ✅ FIX: Last inn font før tekstoppdatering
          try {
            // Sjekk om fontName er gyldig (ikke figma.mixed)
            if (textNode.fontName === figma.mixed) {
              console.warn(`[TEXT_DEBUG] ⚠️ updateField: Tekst har mixed fonts, kan ikke laste inn font`);
              // Prøv å sette characters uansett
              textNode.characters = value;
              console.log(`[TEXT_DEBUG] ✅ updateField: Characters satt til: "${textNode.characters}" (med mixed fonts)`);
            } else {
              console.log(`[TEXT_DEBUG] 📝 updateField: Laster inn font: ${textNode.fontName.family} ${textNode.fontName.style}`);
              await figma.loadFontAsync(textNode.fontName);
              console.log(`[TEXT_DEBUG] ✅ updateField: Font lastet inn`);
              
              // Nå kan vi sette characters
              textNode.characters = value;
              console.log(`[TEXT_DEBUG] ✅ updateField: Characters satt til: "${textNode.characters}"`);
            }
          } catch (fontError) {
            console.warn(`[TEXT_DEBUG] ⚠️ updateField: Kunne ikke laste inn font for ${instance.name}:`, fontError);
            // Prøv å sette characters uansett (kan feile hvis font mangler)
            textNode.characters = value;
            console.log(`[TEXT_DEBUG] ✅ updateField: Characters satt til: "${textNode.characters}" (uten font-loading)`);
          }
        } else {
          console.log(`[TEXT_DEBUG] ⚠️ updateField: ${instance.name} er ikke en TEXT-node (type: ${instance.type})`);
        }
      } else if (field === 'textStyleId') {
        console.log(`[TEXT_DEBUG] 🎨 updateField: Oppdaterer textStyleId på ${instance.name}`);
        if (instance.type === 'TEXT') {
          const textNode = instance as TextNode;
          console.log(`[TEXT_DEBUG] 🎨 updateField: Bruker setTextStyleIdAsync`);
          await textNode.setTextStyleIdAsync(value);
        } else {
          console.log(`[TEXT_DEBUG] ⚠️ updateField: ${instance.name} er ikke en TEXT-node (type: ${instance.type})`);
        }
      } else if (field === 'strokeWeight') {
        console.log(`[STROKE_DEBUG] 🎨 updateField: Oppdaterer strokeWeight på ${instance.name}`);
        if ('strokeWeight' in instance) {
          // Hvis verdi er et objekt med individuelle sider
          if (typeof value === 'object' && value !== null) {
            console.log(`[STROKE_DEBUG] 📊 updateField: Mixed strokeWeight - setter individuelle sider`);
            if ('strokeTopWeight' in value) {
              (instance as any).strokeTopWeight = value.strokeTopWeight;
              console.log(`[STROKE_DEBUG] ✅ updateField: strokeTopWeight satt til ${value.strokeTopWeight}`);
            }
            if ('strokeBottomWeight' in value) {
              (instance as any).strokeBottomWeight = value.strokeBottomWeight;
              console.log(`[STROKE_DEBUG] ✅ updateField: strokeBottomWeight satt til ${value.strokeBottomWeight}`);
            }
            if ('strokeLeftWeight' in value) {
              (instance as any).strokeLeftWeight = value.strokeLeftWeight;
              console.log(`[STROKE_DEBUG] ✅ updateField: strokeLeftWeight satt til ${value.strokeLeftWeight}`);
            }
            if ('strokeRightWeight' in value) {
              (instance as any).strokeRightWeight = value.strokeRightWeight;
              console.log(`[STROKE_DEBUG] ✅ updateField: strokeRightWeight satt til ${value.strokeRightWeight}`);
            }
          } else {
            // Enkelt strokeWeight-verdi
            console.log(`[STROKE_DEBUG] 📊 updateField: Samme strokeWeight på alle sider: ${value}`);
            instance.strokeWeight = value;
            console.log(`[STROKE_DEBUG] ✅ updateField: strokeWeight satt til ${value}`);
          }
        } else {
          console.log(`[STROKE_DEBUG] ⚠️ updateField: ${instance.name} har ikke strokeWeight-egenskap`);
        }
      } else if (field.startsWith('boundVariables/')) {
        const variableField = field.split('/')[1];
        
        // Spesiell håndtering for strokeWeight-variabler
        if (variableField.startsWith('stroke') && (variableField === 'strokeWeight' || 
            variableField === 'strokeTopWeight' || variableField === 'strokeBottomWeight' || 
            variableField === 'strokeLeftWeight' || variableField === 'strokeRightWeight')) {
          console.log(`[STROKE_DEBUG] 🔗 updateField: Setter strokeWeight-variabel: ${variableField}`);
          if ('boundVariables' in instance) {
            const variable = await figma.variables.getVariableByIdAsync(value.id);
            if (variable) {
              instance.setBoundVariable(variableField as VariableBindableNodeField, variable);
              console.log(`[STROKE_DEBUG] ✅ updateField: Variabel satt for ${variableField}`);
            }
          }
        } else if (variableField === 'fills' && 'fills' in instance) {
          if (Array.isArray(instance.fills) && Array.isArray(value)) {
            const fillsCopy = [...instance.fills];
            for (let i = 0; i < Math.min(fillsCopy.length, value.length); i++) {
              const fillRef = value[i];
              if (fillRef && typeof fillRef === 'object' && 'type' in fillRef && fillRef.type === 'VARIABLE_ALIAS') {
                const variable = await figma.variables.getVariableByIdAsync(fillRef.id);
                if (variable && fillsCopy[i] && fillsCopy[i].type === 'SOLID') {
                  fillsCopy[i] = figma.variables.setBoundVariableForPaint(fillsCopy[i] as SolidPaint, 'color', variable);
                }
              }
            }
            instance.fills = fillsCopy;
          }
        } else if (variableField === 'strokes' && 'strokes' in instance) {
          if (Array.isArray(instance.strokes) && Array.isArray(value)) {
            const strokesCopy = [...instance.strokes];
            for (let i = 0; i < Math.min(strokesCopy.length, value.length); i++) {
              const strokeRef = value[i];
              if (strokeRef && typeof strokeRef === 'object' && 'type' in strokeRef && strokeRef.type === 'VARIABLE_ALIAS') {
                const variable = await figma.variables.getVariableByIdAsync(strokeRef.id);
                if (variable && strokesCopy[i] && strokesCopy[i].type === 'SOLID') {
                  strokesCopy[i] = figma.variables.setBoundVariableForPaint(strokesCopy[i] as SolidPaint, 'color', variable);
                }
              }
            }
            instance.strokes = strokesCopy;
          }
        } else {
          // Vanlig variabel-binding for andre felter
          if ('boundVariables' in instance) {
            const variable = await figma.variables.getVariableByIdAsync(value.id);
            if (variable) {
              instance.setBoundVariable(variableField as VariableBindableNodeField, variable);
            }
          }
        }
      } else if (field.startsWith('autolayout/')) {
        const layoutField = field.split('/')[1];
        if ('layoutMode' in instance) {
          (instance as any)[layoutField] = value;
        }
      } else if (field.startsWith('textProperties/')) {
        const textField = field.split('/')[1];
        console.log(`[TEXT_DEBUG] 🎨 updateField: Oppdaterer textProperties/${textField} på ${instance.name}`);
        if (instance.type === 'TEXT') {
          const textNode = instance as TextNode;
          console.log(`[TEXT_DEBUG] 🎨 updateField: Setter ${textField} direkte på TEXT-node`);
          
          // ✅ FIX: Last inn font før textProperties oppdatering
          try {
            if (textNode.fontName === figma.mixed) {
              console.warn(`[TEXT_DEBUG] ⚠️ updateField: Tekst har mixed fonts, kan ikke laste inn font for textProperties`);
            } else {
              console.log(`[TEXT_DEBUG] 🎨 updateField: Laster inn font for textProperties: ${textNode.fontName.family} ${textNode.fontName.style}`);
              await figma.loadFontAsync(textNode.fontName);
              console.log(`[TEXT_DEBUG] ✅ updateField: Font lastet inn for textProperties`);
            }
            
            // Nå kan vi sette textProperties
            (textNode as any)[textField] = value;
            console.log(`[TEXT_DEBUG] ✅ updateField: ${textField} satt til:`, value);
          } catch (fontError) {
            console.warn(`[TEXT_DEBUG] ⚠️ updateField: Kunne ikke laste inn font for textProperties på ${instance.name}:`, fontError);
            // Prøv å sette textProperties uansett
            (textNode as any)[textField] = value;
            console.log(`[TEXT_DEBUG] ✅ updateField: ${textField} satt til:`, value, `(uten font-loading)`);
          }
        } else {
          console.log(`[TEXT_DEBUG] ⚠️ updateField: ${instance.name} er ikke en TEXT-node (type: ${instance.type})`);
        }
      } else {
        // Generisk oppdatering for andre felter
        (instance as any)[field] = value;
      }
      
      console.log(`[TEXT_DEBUG] ✅ updateField: Ferdig med oppdatering av ${field} på ${instance.name}`);
    } catch (error) {
      console.warn(`[TEXT_DEBUG] ❌ updateField: Feil ved oppdatering av ${field} på ${instance.name}:`, error);
    }
  }

  // Reset felt til master-verdi
  async function resetFieldToMaster(instance: SceneNode, field: string): Promise<void> {
    console.log(`[INSTANCE_DEBUG] 🔄 resetFieldToMaster: Resetter ${field} på ${instance.name} til master-verdi`);
    
    try {
      // Spesiell håndtering for instanser - bruk resetOverrides()
      if (instance.type === 'INSTANCE') {
        const instanceNode = instance as InstanceNode;
        console.log(`[INSTANCE_DEBUG] 🔄 resetFieldToMaster: Bruker resetOverrides() for instans ${instance.name}`);
        instanceNode.resetOverrides();
        console.log(`[INSTANCE_DEBUG] ✅ resetFieldToMaster: Resatt alle overstyringer på instans ${instance.name}`);
        return;
      }
      
      if (field === 'characters') {
        if (instance.type === 'TEXT') {
          const textNode = instance as TextNode;
          // Reset til master-tekst (krever master-komponent tilgang)
          // TODO: Implementer master-komponent tilgang
          console.log(`[resetFieldToMaster] ⚠️ Tekst-reset krever master-komponent tilgang`);
        }
      } else if (field === 'strokeWeight' || field.startsWith('boundVariables/stroke')) {
        console.log(`[STROKE_DEBUG] 🔄 resetFieldToMaster: Resetter strokeWeight på ${instance.name}`);
        if ('strokeWeight' in instance) {
          // Fjern alle strokeWeight-variabel-bindinger
          if ('boundVariables' in instance) {
            instance.setBoundVariable('strokeWeight', null);
            instance.setBoundVariable('strokeTopWeight', null);
            instance.setBoundVariable('strokeBottomWeight', null);
            instance.setBoundVariable('strokeLeftWeight', null);
            instance.setBoundVariable('strokeRightWeight', null);
            console.log(`[STROKE_DEBUG] ✅ resetFieldToMaster: Alle strokeWeight-variabler fjernet`);
          }
        }
      } else if (field.startsWith('boundVariables/')) {
        const variableField = field.split('/')[1];
        if ('boundVariables' in instance) {
          // Fjern variabel-binding
          instance.setBoundVariable(variableField as VariableBindableNodeField, null);
        }
      } else if (field.startsWith('autolayout/')) {
        const layoutField = field.split('/')[1];
        if ('layoutMode' in instance) {
          // Reset til default-verdi
          (instance as any)[layoutField] = undefined;
        }
      } else {
        // Generisk reset for andre felter
        (instance as any)[field] = undefined;
      }
      
      console.log(`[resetFieldToMaster] ✅ Resatt ${field} på ${instance.name}`);
    } catch (error) {
      console.warn(`[resetFieldToMaster] ❌ Feil ved reset av ${field} på ${instance.name}:`, error);
    }
  }

  // Rekursiv hjelpefunksjon for å hente ut all relevant info fra en node (SceneNode)
  async function extractNodeRecursive(node: SceneNode, depth = 0, overriddenFieldsForThisNode: string[] = [], overridesMapForChildren: Record<string, string[]> = {}): Promise<any> {
    const info: any = {
      name: node.name,
      id: node.id,
      type: node.type
    };

    // Hent overstyrte felter hvis det er en instans (kun på toppnivå eller hvis ikke eksplisitt sendt inn)
    let overriddenFields: string[] = overriddenFieldsForThisNode;
    let overridesMap: Record<string, string[]> = overridesMapForChildren;
    if (overriddenFields.length === 0 && node.type === 'INSTANCE') {
      if ('overrides' in node && Array.isArray((node as any).overrides)) {
        console.log(`[extractNodeRecursive] FULL overrides-array for ${node.name} (${node.id}):`, (node as any).overrides);
      }
      if ('children' in node && Array.isArray((node as any).children)) {
        console.log(`[extractNodeRecursive] CHILDREN for ${node.name} (${node.id}):`, (node as any).children.map((c: any, i: number) => ({i, name: c.name, id: c.id, type: c.type})));
      }
      overridesMap = getOverridesMapFromInstance(node);
      if (Object.keys(overridesMap).length > 0) {
        console.log(`[extractNodeRecursive] INSTANCE ${node.name} (${node.id}) har overridesMap:`, overridesMap);
      }
    }

    // Eksporter kun propertyene som faktisk er i overriddenFields hvis listen er satt
    const shouldFilter = false; // TODO: Implementer bedre override-håndtering senere

    if ('subcomponents' in node || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
      info.subcomponents = findSubcomponents(node);
    }
    if ('constraints' in node) {
      if (!shouldFilter || overriddenFields.includes('constraints')) {
        info.constraints = {
          horizontal: node.constraints.horizontal,
          vertical: node.constraints.vertical
        };
      }
    }
    if ('boundVariables' in node && node.boundVariables) {
      const boundVars: any = {};
      for (const key of Object.keys(node.boundVariables)) {
        if (!shouldFilter || overriddenFields.includes(`boundVariables/${key}`) || overriddenFields.includes(key)) {
          const value = (node.boundVariables as any)[key];
          if (Array.isArray(value)) {
            boundVars[key] = value.map((v: any) => ({ type: v.type, id: v.id }));
          } else {
            boundVars[key] = { type: value.type, id: value.id };
          }
        }
      }
      if (Object.keys(boundVars).length > 0) {
        info.boundVariables = boundVars;
      }
    }

    // Hent strokeWeight-informasjon
    if (!shouldFilter || overriddenFields.includes('strokeWeight')) {
      const strokeWeightInfo = await extractStrokeWeight(node);
      if (strokeWeightInfo !== null) {
        info.strokeWeight = strokeWeightInfo;
      }
    }
    // Hent tekstinnhold og styles hvis det er tekstnode
    if (node.type === 'TEXT') {
      // Logging for feilsøking av textStyleId/textStyleName
      console.log(`[extractNodeRecursive][EXPORT] Tekstnode: name='${node.name}', id='${node.id}', textStyleId='${(node as any).textStyleId}'`);
      const localStyles = await figma.getLocalTextStylesAsync();
      const styleList = localStyles.map(s => `${s.id}:${s.name}`).join(', ');
      console.log(`[extractNodeRecursive][EXPORT] Lokale text styles: ${styleList}`);
      if (!shouldFilter || overriddenFields.includes('characters')) {
        if ('characters' in node) {
          info.characters = node.characters;
        }
      }
      // Alltid forsøk å eksportere textStyleName
      let styleId: string | undefined = undefined;
      if (!shouldFilter || overriddenFields.includes('textStyleId')) {
        if ('textStyleId' in node && node.textStyleId && typeof node.textStyleId === 'string') {
          info.textStyleId = node.textStyleId;
          styleId = node.textStyleId;
        }
      }
      // Normaliseringsfunksjon for id
      function normalizeId(id: string) {
        return id.trim().replace(/,+$/, '');
      }
      if (styleId) {
        const cleanStyleId = normalizeId(styleId);
        const localStyles2 = await figma.getLocalTextStylesAsync();
        const localMatch = localStyles2.find(s => normalizeId(s.id) === cleanStyleId);
        info.textStyleName = localMatch ? localMatch.name : null;
      }
      if (!shouldFilter || overriddenFields.includes('textProperties')) {
        const textProperties = ['fontSize', 'fontFamily', 'fontStyle', 'fontWeight', 'lineHeight', 'letterSpacing', 'textCase', 'textDecoration'];
        const textVars: any = {};
        for (const prop of textProperties) {
          if (prop in node) {
            const value = (node as any)[prop];
            if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
              textVars[prop] = { type: value.type, id: value.id };
            } else if (value !== undefined && value !== null) {
              textVars[prop] = value;
            }
          }
        }
        if (Object.keys(textVars).length > 0) {
          info.textProperties = textVars;
        }
      }
    }
    const typesWithChildren = [
      'FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'PAGE'
    ];
    if ('children' in node && typesWithChildren.includes(node.type)) {
      info.children = [];
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // For instanser: kun ta med barn som har overrides (id-match)
        if (node.type === 'INSTANCE' && Object.keys(overridesMap).length > 0) {
          const childOverrides = overridesMap[child.id] || [];
          if (childOverrides.length === 0) continue;
          console.log(`[extractNodeRecursive] INSTANCE child ${child.name} (${child.id}) har overrides:`, childOverrides);
          // Stram inn: kun eksporter propertyene i childOverrides
          info.children.push(await extractNodeRecursive(child, depth + 1, childOverrides));
        } else {
          info.children.push(await extractNodeRecursive(child, depth + 1));
        }
      }
    }

    // Eksporter autolayout-properties hvis node har autolayout
    if ('layoutMode' in node && node.layoutMode && node.layoutMode !== 'NONE') {
      info.autolayout = {
        layoutMode: node.layoutMode,
        primaryAxisAlignItems: (node as any).primaryAxisAlignItems,
        counterAxisAlignItems: (node as any).counterAxisAlignItems,
        itemSpacing: (node as any).itemSpacing,
        paddingLeft: (node as any).paddingLeft,
        paddingRight: (node as any).paddingRight,
        paddingTop: (node as any).paddingTop,
        paddingBottom: (node as any).paddingBottom,
        layoutWrap: (node as any).layoutWrap,
        primaryAxisSizingMode: (node as any).primaryAxisSizingMode,
        counterAxisSizingMode: (node as any).counterAxisSizingMode,
        strokesIncludedInLayout: (node as any).strokesIncludedInLayout,
        counterAxisAlignContent: (node as any).counterAxisAlignContent,
        itemReverseZIndex: (node as any).itemReverseZIndex,
        layoutPositioning: (node as any).layoutPositioning,
        layoutGrow: (node as any).layoutGrow,
        layoutAlign: (node as any).layoutAlign,
        counterAxisSpacing: (node as any).counterAxisSpacing
      };
      console.log(`[extractNodeRecursive] Eksporterer autolayout for ${node.name} (${node.id}):`, info.autolayout);
    }

    return info;
  }

  // Hjelpefunksjon for å finne node fra rot (figma.root) basert på id
  function findNodeById(node: BaseNode, id: string): SceneNode | null {
    if ('id' in node && node.id === id) return node as SceneNode;
    if ('children' in node) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  // Hjelpefunksjon for å finne komponent i Figma basert på navn/type
  async function findComponentInFigma(ref: any): Promise<any> {
    const found = await figma.root.findAll(node =>
      node.type === ref.type &&
      node.name.trim() === (ref.name || '').trim() &&
      (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET')))
    );
    if (found.length > 0) {
      const node = found[0];
      if (node.type === 'COMPONENT_SET' && 'children' in node) {
        const setInfo: any = {
          name: node.name,
          id: node.id,
          type: node.type,
          variants: []
        };
        for (const child of node.children) {
          if (child.type === 'COMPONENT') {
            const variant = await extractNodeRecursive(child);
            setInfo.variants.push(variant);
          }
        }
        return setInfo;
      } else if (node.type === 'COMPONENT') {
        return await extractNodeRecursive(node as SceneNode);
      }
    }
    return null;
  }

  function normalize(val: any) {
    if (val === undefined) return [];
    return val;
  }

  function compareComponent(curr: any, ref: any, parentName?: string): string {
    let diff = '';
    const compName = parentName || curr.name;
    let hasDifferences = false;
    
    console.log(`[TEXT_DEBUG] 🔍 compareComponent: Sammenligner ${compName} (type: ${curr.type})`);
    
    // Normaliser data
    const currConstraints = normalize(curr.constraints);
    const refConstraints = normalize(ref.constraints);
    const currBoundVars = normalize(curr.boundVariables);
    const refBoundVars = normalize(ref.boundVariables);
    const currSub = normalize(curr.subcomponents);
    const refSub = normalize(ref.subcomponents);
    
    // Sammenlign constraints
    if (JSON.stringify(currConstraints) !== JSON.stringify(refConstraints)) {
      hasDifferences = true;
    }
    
    // Sammenlign boundVariables
    if (JSON.stringify(currBoundVars) !== JSON.stringify(refBoundVars)) {
      hasDifferences = true;
    }
    
    // Sammenlign strokeWeight
    const currStrokeWeight = normalize(curr.strokeWeight);
    const refStrokeWeight = normalize(ref.strokeWeight);
    if (JSON.stringify(currStrokeWeight) !== JSON.stringify(refStrokeWeight)) {
      console.log(`[STROKE_DEBUG] ❌ compareComponent: strokeWeight forskjellig for ${compName}`);
      console.log(`[STROKE_DEBUG] 📊 compareComponent: curr.strokeWeight:`, currStrokeWeight);
      console.log(`[STROKE_DEBUG] 📄 compareComponent: ref.strokeWeight:`, refStrokeWeight);
      hasDifferences = true;
    }
    
    // Sammenlign autolayout
    if ((curr.autolayout || ref.autolayout) && JSON.stringify(curr.autolayout) !== JSON.stringify(ref.autolayout)) {
      hasDifferences = true;
    }
    
    // Sammenlign tekststiler og tekstproperties for TEXT-noder
    if (curr.type === 'TEXT' && ref.type === 'TEXT') {
      console.log(`[TEXT_DEBUG] 📝 compareComponent: Dette er en TEXT-node: ${compName}`);
      console.log(`[TEXT_DEBUG] 📊 compareComponent: curr.characters: "${curr.characters}"`);
      console.log(`[TEXT_DEBUG] 📄 compareComponent: ref.characters: "${ref.characters}"`);
      
      // Sammenlign characters (tekstinnhold)
      if (curr.characters !== ref.characters) {
        console.log(`[TEXT_DEBUG] ❌ compareComponent: Characters forskjellig for ${compName}`);
        hasDifferences = true;
      }
      
      // Sammenlign textStyleName hvis begge har det
      if (curr.textStyleName && ref.textStyleName) {
        if (curr.textStyleName !== ref.textStyleName) {
          console.log(`[TEXT_DEBUG] ❌ compareComponent: textStyleName forskjellig for ${compName}`);
          hasDifferences = true;
        }
      } else {
        // Fallback: Sammenlign textStyleId hvis navn mangler
        if (curr.textStyleId !== ref.textStyleId) {
          console.log(`[TEXT_DEBUG] ❌ compareComponent: textStyleId forskjellig for ${compName}`);
          hasDifferences = true;
        }
      }
      
      // Sammenlign textProperties (direkte variabler) hvis ingen tekststil
      if (!curr.textStyleId && !ref.textStyleId) {
        const currTextProps = normalize(curr.textProperties);
        const refTextProps = normalize(ref.textProperties);
        if (JSON.stringify(currTextProps) !== JSON.stringify(refTextProps)) {
          console.log(`[TEXT_DEBUG] ❌ compareComponent: textProperties forskjellig for ${compName}`);
          hasDifferences = true;
        }
      }
    } else {
      console.log(`[TEXT_DEBUG] ℹ️ compareComponent: Ikke en TEXT-node: ${compName} (type: ${curr.type})`);
    }
    
    // Sammenlign subcomponents med mer detaljert info
    if (JSON.stringify(currSub) !== JSON.stringify(refSub)) {
      hasDifferences = true;
    }
    
    // Rekursiv sammenligning av children - men ikke rapporter individuelle forskjeller
    const currChildren = curr.children || [];
    const refChildren = ref.children || [];
    
    console.log(`[TEXT_DEBUG] 👶 compareComponent: ${compName} har ${currChildren.length} children`);
    
    if (currChildren.length !== refChildren.length) {
      hasDifferences = true;
    } else {
      // Sammenlign hvert barn (rekursivt) - men samle resultatet
      for (let i = 0; i < currChildren.length; i++) {
        const currChild = currChildren[i];
        const refChild = refChildren[i];
        
        console.log(`[TEXT_DEBUG] 🔍 compareComponent: Sammenligner child ${i}: ${currChild.name} (${currChild.type})`);
        
        if (!currChild && refChild) {
          hasDifferences = true;
          break;
        }
        if (currChild && !refChild) {
          hasDifferences = true;
          break;
        }
        
        // Sammenlign navn og type
        if (currChild.name !== refChild.name || currChild.type !== refChild.type) {
          hasDifferences = true;
          break;
        }
        
        // Rekursiv sammenligning - bruk en hjelpefunksjon som returnerer boolean
        const childHasDifferences = compareComponentInternal(currChild, refChild, `${compName} > ${refChild.name}`);
        if (childHasDifferences) {
          hasDifferences = true;
          break;
        }
      }
    }
    
    // Rapporter kun én melding per komponent hvis det er forskjeller
    if (hasDifferences) {
      diff = `Forskjell i komponent: ${compName}\n`;
    }
    
    if (diff) {
      console.log(`[COMPARE_DEBUG] Forskjeller funnet for ${compName}`);
    }
    
    return diff;
  }

  // Hjelpefunksjon som returnerer boolean i stedet for string
  function compareComponentInternal(curr: any, ref: any, parentName?: string): boolean {
    const compName = parentName || curr.name;
    let hasDifferences = false;
    
    console.log(`[TEXT_DEBUG] 🔍 compareComponentInternal: Sammenligner ${compName} (type: ${curr.type})`);
    
    // Normaliser data
    const currConstraints = normalize(curr.constraints);
    const refConstraints = normalize(ref.constraints);
    const currBoundVars = normalize(curr.boundVariables);
    const refBoundVars = normalize(ref.boundVariables);
    const currSub = normalize(curr.subcomponents);
    const refSub = normalize(ref.subcomponents);
    
    // Sammenlign constraints
    if (JSON.stringify(currConstraints) !== JSON.stringify(refConstraints)) {
      hasDifferences = true;
    }
    
    // Sammenlign boundVariables
    if (JSON.stringify(currBoundVars) !== JSON.stringify(refBoundVars)) {
      hasDifferences = true;
    }
    
    // Sammenlign strokeWeight
    const currStrokeWeight = normalize(curr.strokeWeight);
    const refStrokeWeight = normalize(ref.strokeWeight);
    if (JSON.stringify(currStrokeWeight) !== JSON.stringify(refStrokeWeight)) {
      console.log(`[STROKE_DEBUG] ❌ compareComponentInternal: strokeWeight forskjellig for ${compName}`);
      console.log(`[STROKE_DEBUG] 📊 compareComponentInternal: curr.strokeWeight:`, currStrokeWeight);
      console.log(`[STROKE_DEBUG] 📄 compareComponentInternal: ref.strokeWeight:`, refStrokeWeight);
      hasDifferences = true;
    }
    
    // Sammenlign autolayout
    if ((curr.autolayout || ref.autolayout) && JSON.stringify(curr.autolayout) !== JSON.stringify(ref.autolayout)) {
      hasDifferences = true;
    }
    
    // Sammenlign tekststiler og tekstproperties for TEXT-noder
    if (curr.type === 'TEXT' && ref.type === 'TEXT') {
      console.log(`[TEXT_DEBUG] 📝 compareComponentInternal: Dette er en TEXT-node: ${compName}`);
      console.log(`[TEXT_DEBUG] 📊 compareComponentInternal: curr.characters: "${curr.characters}"`);
      console.log(`[TEXT_DEBUG] 📄 compareComponentInternal: ref.characters: "${ref.characters}"`);
      
      // Sammenlign characters (tekstinnhold)
      if (curr.characters !== ref.characters) {
        console.log(`[TEXT_DEBUG] ❌ compareComponentInternal: Characters forskjellig for ${compName}`);
        hasDifferences = true;
      }
      
      // Sammenlign textStyleName hvis begge har det
      if (curr.textStyleName && ref.textStyleName) {
        if (curr.textStyleName !== ref.textStyleName) {
          console.log(`[TEXT_DEBUG] ❌ compareComponentInternal: textStyleName forskjellig for ${compName}`);
          hasDifferences = true;
        }
      } else {
        // Fallback: Sammenlign textStyleId hvis navn mangler
        if (curr.textStyleId !== ref.textStyleId) {
          console.log(`[TEXT_DEBUG] ❌ compareComponentInternal: textStyleId forskjellig for ${compName}`);
          hasDifferences = true;
        }
      }
      
      // Sammenlign textProperties (direkte variabler) hvis ingen tekststil
      if (!curr.textStyleId && !ref.textStyleId) {
        const currTextProps = normalize(curr.textProperties);
        const refTextProps = normalize(ref.textProperties);
        if (JSON.stringify(currTextProps) !== JSON.stringify(refTextProps)) {
          console.log(`[TEXT_DEBUG] ❌ compareComponentInternal: textProperties forskjellig for ${compName}`);
          hasDifferences = true;
        }
      }
    } else {
      console.log(`[TEXT_DEBUG] ℹ️ compareComponentInternal: Ikke en TEXT-node: ${compName} (type: ${curr.type})`);
    }
    
    // Sammenlign subcomponents med mer detaljert info
    if (JSON.stringify(currSub) !== JSON.stringify(refSub)) {
      hasDifferences = true;
    }
    
    // Rekursiv sammenligning av children
    const currChildren = curr.children || [];
    const refChildren = ref.children || [];
    
    console.log(`[TEXT_DEBUG] 👶 compareComponentInternal: ${compName} har ${currChildren.length} children`);
    
    if (currChildren.length !== refChildren.length) {
      hasDifferences = true;
    } else {
      // Sammenlign hvert barn (rekursivt) - bruk smart matching
      for (let i = 0; i < refChildren.length; i++) {
        const refChild = refChildren[i];
        
        console.log(`[TEXT_DEBUG] 🔍 compareComponentInternal: Søker etter match for child ${i}: ${refChild.name} (${refChild.type})`);
        
        // Bruk smart matching for å finne riktig child
        const match = findMatchingChild(currChildren, refChild, i);
        
        if (!match) {
          console.log(`[TEXT_DEBUG] ❌ compareComponentInternal: Kunne ikke finne match for ${refChild.name}`);
          hasDifferences = true;
          break;
        }
        
        const currChild = match.child;
        console.log(`[TEXT_DEBUG] 🔍 compareComponentInternal: Sammenligner ${currChild.name} (${currChild.type}) med ${refChild.name} (${refChild.type})`);
        
        // Rekursiv sammenligning
        const childHasDifferences = compareComponentInternal(currChild, refChild, `${compName} > ${refChild.name}`);
        if (childHasDifferences) {
          hasDifferences = true;
          break;
        }
      }
    }
    
    if (hasDifferences) {
      console.log(`[COMPARE_DEBUG] Forskjeller funnet for ${compName} (internal)`);
    }
    
    return hasDifferences;
  }

  // Hjelpefunksjon for å matche children basert på type
  function findMatchingChild(currChildren: readonly any[], refChild: any, childIndex: number): { child: any, index: number } | null {
    // For TEXT-noder: prøv å matche på id først, deretter posisjon
    if (refChild.type === 'TEXT') {
      console.log(`[TEXT_DEBUG] 🔍 findMatchingChild: Søker etter TEXT-node med id: ${refChild.id}`);
      
      // Prøv å finne på id
      if (refChild.id) {
        const matchById = currChildren.find(child => child.id === refChild.id);
        if (matchById) {
          console.log(`[TEXT_DEBUG] ✅ findMatchingChild: Fant TEXT-node på id: ${matchById.name}`);
          return { child: matchById, index: currChildren.indexOf(matchById) };
        }
      }
      
      // Fallback: bruk posisjon (index)
      if (childIndex < currChildren.length) {
        const childAtPosition = currChildren[childIndex];
        if (childAtPosition.type === 'TEXT') {
          console.log(`[TEXT_DEBUG] ✅ findMatchingChild: Bruker TEXT-node på posisjon ${childIndex}: ${childAtPosition.name}`);
          return { child: childAtPosition, index: childIndex };
        }
      }
      
      console.log(`[TEXT_DEBUG] ❌ findMatchingChild: Kunne ikke finne TEXT-node for ${refChild.name}`);
      return null;
    }
    
    // For andre nodetyper: bruk name og type
    console.log(`[TEXT_DEBUG] 🔍 findMatchingChild: Søker etter ${refChild.type}-node med navn: ${refChild.name}`);
    
    // Prøv å finne på id først
    if (refChild.id) {
      const matchById = currChildren.find(child => child.id === refChild.id);
      if (matchById && matchById.type === refChild.type) {
        console.log(`[TEXT_DEBUG] ✅ findMatchingChild: Fant ${refChild.type}-node på id: ${matchById.name}`);
        return { child: matchById, index: currChildren.indexOf(matchById) };
      }
    }
    
    // Prøv å finne på name og type
    const matchByName = currChildren.find(child => 
      child.name === refChild.name && child.type === refChild.type
    );
    if (matchByName) {
      console.log(`[TEXT_DEBUG] ✅ findMatchingChild: Fant ${refChild.type}-node på navn: ${matchByName.name}`);
      return { child: matchByName, index: currChildren.indexOf(matchByName) };
    }
    
    // Fallback: bruk posisjon hvis type matcher
    if (childIndex < currChildren.length) {
      const childAtPosition = currChildren[childIndex];
      if (childAtPosition.type === refChild.type) {
        console.log(`[TEXT_DEBUG] ✅ findMatchingChild: Bruker ${refChild.type}-node på posisjon ${childIndex}: ${childAtPosition.name}`);
        return { child: childAtPosition, index: childIndex };
      }
    }
    
    console.log(`[TEXT_DEBUG] ❌ findMatchingChild: Kunne ikke finne ${refChild.type}-node for ${refChild.name}`);
    return null;
  }

  if (msg.type === 'list-components') {
    await figma.loadAllPagesAsync();
    const allComponents = figma.root.findAll(node =>
      node.type === 'COMPONENT' || node.type === 'COMPONENT_SET'
    );
    // Filtrer ut COMPONENT som er barn av COMPONENT_SET (dvs. kun vis ComponentSet og "frie" Component)
    const componentList = allComponents.filter(node => {
      if (node.type === 'COMPONENT_SET') return true;
      if (node.type === 'COMPONENT' && node.parent && node.parent.type !== 'COMPONENT_SET') return true;
      return false;
    }).map(node => ({
      name: node.name,
      id: node.id,
      type: node.type
    }));
    if (componentList.length === 0) {
      figma.ui.postMessage({
        type: 'component-list',
        components: [],
        error: 'Ingen komponenter funnet.'
      });
    } else {
      figma.ui.postMessage({
        type: 'component-list',
        components: componentList
      });
    }
    return;
  }
  if (msg.type === 'export-profile') {
    const componentIds: string[] = Array.isArray((msg as any).componentIds) ? (msg as any).componentIds : [];
    const components: any[] = [];

    for (const id of componentIds) {
      let foundNode: SceneNode | null = null;
      let foundPage: PageNode | null = null;
      for (const page of figma.root.children) {
        if (page.type === 'PAGE') {
          await page.loadAsync();
          for (const node of page.children) {
            foundNode = findNodeById(node, id);
            if (foundNode) {
              foundPage = page;
              break;
            }
          }
        }
        if (foundNode) break;
      }
      const node = foundNode;
      const pageName = foundPage ? foundPage.name : undefined;
      const pageId = foundPage ? foundPage.id : undefined;
      if (node) {
        if (node.type === 'COMPONENT_SET' && 'children' in node) {
          const setInfo: any = {
            name: node.name,
            id: node.id,
            type: node.type,
            pageName,
            pageId,
            variants: []
          };
          for (const child of node.children) {
            if (child.type === 'COMPONENT') {
              const variant = await extractNodeRecursive(child);
              // Legg til pageName og pageId på hver variant også
              variant.pageName = pageName;
              variant.pageId = pageId;
              setInfo.variants.push(variant);
            }
          }
          components.push(setInfo);
        } else {
          const comp = await extractNodeRecursive(node);
          comp.pageName = pageName;
          comp.pageId = pageId;
          components.push(comp);
        }
      }
    }
    figma.ui.postMessage({
      type: 'exported-profile',
      profile: components
    });
    return;
  }
  if (msg.type === 'compare-profile') {
    const referenceProfile = (msg as any).referenceProfile;

    // Samle alle unike pageId fra referenceProfile (og varianter)
    const pageIds = new Set<string>();
    for (const ref of referenceProfile) {
      if (ref.pageId) pageIds.add(ref.pageId);
      if (ref.variants && Array.isArray(ref.variants)) {
        for (const variant of ref.variants) {
          if (variant.pageId) pageIds.add(variant.pageId);
        }
      }
    }
    // Hvis noen mangler pageId, last inn alle sider (fallback)
    let fallbackLoadAll = false;
    for (const ref of referenceProfile) {
      if (!ref.pageId) fallbackLoadAll = true;
      if (ref.variants && Array.isArray(ref.variants)) {
        for (const variant of ref.variants) {
          if (!variant.pageId) fallbackLoadAll = true;
        }
      }
    }
    let relevantPages: PageNode[] = [];
    if (fallbackLoadAll || pageIds.size === 0) {
      await figma.loadAllPagesAsync();
      relevantPages = figma.root.children.filter((p): p is PageNode => p.type === 'PAGE');
    } else {
      for (const page of figma.root.children) {
        if (page.type === 'PAGE' && pageIds.has(page.id)) {
          await page.loadAsync();
        }
      }
      relevantPages = figma.root.children.filter((p): p is PageNode => p.type === 'PAGE' && pageIds.has(p.id));
    }

    // Sammenligningslogikk som før, men søk på hver side
    let result = '';
    for (const ref of referenceProfile) {
      let found: SceneNode | null = null;
      for (const page of relevantPages) {
        const matches = page.findAll(node =>
          node.type === ref.type &&
          node.name.trim() === (ref.name || '').trim() &&
          (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET')))
        );
        if (matches.length > 0) {
          found = matches[0];
          break;
        }
      }
      let curr = null;
      if (found) {
        if (found.type === 'COMPONENT_SET' && 'children' in found) {
          const setInfo: any = {
            name: found.name,
            id: found.id,
            type: found.type,
            variants: []
          };
          for (const child of found.children) {
            if (child.type === 'COMPONENT') {
              const variant = await extractNodeRecursive(child);
              setInfo.variants.push(variant);
            }
          }
          curr = setInfo;
        } else {
          curr = await extractNodeRecursive(found);
        }
      }
      if (!curr) {
        result += `Mangler komponent i Figma: ${ref.name}\n`;
        continue;
      }
      if (ref.type === 'COMPONENT_SET') {
        // Sammenlign varianter
        const refVariants = ref.variants || [];
        const currVariants = curr.variants || [];
        for (const refVar of refVariants) {
          const currVar = currVariants.find((v: any) => v.name.trim() === (refVar.name || '').trim());
          if (!currVar) {
            result += `Mangler variant i Figma: ${refVar.name} i ${ref.name}\n`;
            continue;
          }
          const diff = compareComponent(currVar, refVar, `${ref.name} > ${refVar.name}`);
          if (diff) {
            result += diff;
          } else {
            result += `Ingen forskjeller funnet for variant ${refVar.name} i ${ref.name}\n`;
          }
        }
      } else {
        const diff = compareComponent(curr, ref, ref.name);
        if (diff) {
          result += diff;
        } else {
          result += `Ingen forskjeller funnet for komponent ${ref.name}\n`;
        }
      }
    }

    if (!result.trim()) {
      result = 'Ingen forskjeller funnet.';
    }
    figma.ui.postMessage({
      type: 'comparison-result',
      result: result
    });
    return;
  }

  if (msg.type === 'update-components') {
    const referenceProfile = (msg as any).referenceProfile;
    // Samle alle unike pageId fra referenceProfile (og varianter)
    const pageIds = new Set<string>();
    for (const ref of referenceProfile) {
      if (ref.pageId) pageIds.add(ref.pageId);
      if (ref.variants && Array.isArray(ref.variants)) {
        for (const variant of ref.variants) {
          if (variant.pageId) pageIds.add(variant.pageId);
        }
      }
    }
    // Hvis noen mangler pageId, last inn alle sider (fallback)
    let fallbackLoadAll = false;
    for (const ref of referenceProfile) {
      if (!ref.pageId) fallbackLoadAll = true;
      if (ref.variants && Array.isArray(ref.variants)) {
        for (const variant of ref.variants) {
          if (!variant.pageId) fallbackLoadAll = true;
        }
      }
    }
    let relevantPages: PageNode[] = [];
    if (fallbackLoadAll || pageIds.size === 0) {
      await figma.loadAllPagesAsync();
      relevantPages = figma.root.children.filter((p): p is PageNode => p.type === 'PAGE');
    } else {
      for (const page of figma.root.children) {
        if (page.type === 'PAGE' && pageIds.has(page.id)) {
          await page.loadAsync();
        }
      }
      relevantPages = figma.root.children.filter((p): p is PageNode => p.type === 'PAGE' && pageIds.has(p.id));
    }
    // Last inn alle variabler først
    await figma.variables.getLocalVariablesAsync();
    await figma.variables.getLocalVariableCollectionsAsync();
    let updateResult = '';
    // Oppdater komponenter basert på referanseprofilen
    for (const ref of referenceProfile) {
      let found: SceneNode | null = null;
      for (const page of relevantPages) {
        const matches = page.findAll(node =>
          node.type === ref.type &&
          node.name.trim() === (ref.name || '').trim() &&
          (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && (!node.parent || node.parent.type !== 'COMPONENT_SET')))
        );
        if (matches.length > 0) {
          found = matches[0];
          break;
        }
      }
      if (!found) {
        updateResult += `Kunne ikke finne komponent: ${ref.name}\n`;
        continue;
      }
      const node = found;
      // Hvis COMPONENT_SET, logg og oppdater alle varianter
      if (node.type === 'COMPONENT_SET' && ref.variants) {
        const nodeVariants = node.children.filter((n: any) => n.type === 'COMPONENT');
        for (let i = 0; i < ref.variants.length; i++) {
          const refVar = ref.variants[i];
          const nodeVar = nodeVariants.find((n: any) => n.name.trim() === (refVar.name || '').trim());
          if (!nodeVar) {
            updateResult += `Kunne ikke finne variant: ${refVar.name} i ${ref.name}\n`;
            continue;
          }
          // Logging for variant
          console.log(`\n[updateNodeRecursive] Oppdaterer variant: ${refVar.name} (${nodeVar.id}) i ${ref.name}`);
          console.log(`[updateNodeRecursive] ref-objekt for variant:`, refVar);
          console.log(`[updateNodeRecursive] ref keys for variant:`, Object.keys(refVar));
          await updateNodeRecursive(nodeVar as SceneNode, refVar, `${ref.name} > ${refVar.name}`);
          updateResult += `Oppdatert variant: ${refVar.name} i ${ref.name}\n`;
        }
        updateResult += `Oppdatert: ${ref.name}\n`;
      } else {
        await updateNodeRecursive(node as SceneNode, ref, ref.name);
        updateResult += `Oppdatert: ${ref.name}\n`;
      }
    }
    figma.ui.postMessage({
      type: 'update-result',
      result: updateResult || 'Ingen komponenter ble oppdatert.'
    });
    return;
  }

  // Oppdatert hjelpefunksjon for å oppdatere en node og dens children rekursivt (JSON som source of truth)
  async function updateNodeRecursive(node: SceneNode, ref: any, nodePath: string, allowedFields: string[] = []): Promise<void> {
    console.log(`\n[INSTANCE_DEBUG] 🚀 updateNodeRecursive: Starter oppdatering av node: ${nodePath} (${node.type})`);
    console.log(`[INSTANCE_DEBUG] 📋 updateNodeRecursive: ref-objekt for ${nodePath}:`, ref);
    console.log(`[INSTANCE_DEBUG] 🔑 updateNodeRecursive: ref keys:`, Object.keys(ref));

    // Spesiell håndtering for INSTANSER: Reset først, deretter sammenlign
    if (node.type === 'INSTANCE') {
      console.log(`[INSTANCE_DEBUG] 🔄 updateNodeRecursive: Dette er en INSTANS - resetter først`);
      
      // Reset alle overstyringer på instansen
      const instanceNode = node as InstanceNode;
      instanceNode.resetOverrides();
      console.log(`[INSTANCE_DEBUG] ✅ updateNodeRecursive: Resatt alle overstyringer på instans ${node.name}`);
      
      // Nå sammenlign med JSON etter reset
      const differences = await findDifferences(node, ref);
      await applyDifferences(node, differences);
    } else {
      console.log(`[INSTANCE_DEBUG] 📝 updateNodeRecursive: Dette er IKKE en instans - sammenligner direkte`);
      
      // For komponenter og andre noder: sammenlign direkte med JSON
      const differences = await findDifferences(node, ref);
      await applyDifferences(node, differences);
    }

    // Oppdater children rekursivt
    if ('children' in node && ref.children) {
      for (let i = 0; i < ref.children.length; i++) {
        const refChild = ref.children[i];
        
        console.log(`[INSTANCE_DEBUG] 🔍 updateNodeRecursive: Søker etter match for child ${i}: ${refChild.name} (${refChild.type}) for ${nodePath}`);
        
        // Bruk smart matching for å finne riktig child
        const match = findMatchingChild(node.children, refChild, i);
        
        if (!match) {
          console.warn(`[INSTANCE_DEBUG] ⚠️ updateNodeRecursive: Kunne ikke finne match for ${refChild.name} (${refChild.type}) i ${nodePath}`);
          continue;
        }
        
        const child = match.child;
        console.log(`[INSTANCE_DEBUG] 🔍 updateNodeRecursive: Går inn i child: ${child.name} (${child.type}) for ${nodePath}`);
        
        await updateNodeRecursive(child, refChild, `${nodePath} > ${refChild.name}`);
      }
    }
    
    console.log(`[INSTANCE_DEBUG] ✅ updateNodeRecursive: Ferdig med node: ${nodePath} (${node.type})`);
  }
}
*/