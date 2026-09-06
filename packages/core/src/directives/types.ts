// Metadados declarativos de cada diretiva: nome, descrição e atributos
// aceitos. Isso existe para que ferramentas externas (a extensão do VS
// Code, principalmente) consigam oferecer autocomplete, hover e validação
// sem duplicar as listas de valores válidos — elas sempre leem os mesmos
// arrays (`VALID_TYPES`, `VALID_LEVELS` etc.) que a validação usa, nunca uma
// cópia à parte.

export interface AttributeSchema {
  name: string;
  description: string;
  /** Valores enumerados aceitos, quando aplicável (ex.: tipos de chart). */
  values?: readonly string[];
  valueKind: 'enum' | 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
}

export interface DirectiveSchema {
  name: string;
  description: string;
  attributes: AttributeSchema[];
  /** Falso para diretivas de linha única sem corpo (ex.: progress). */
  hasBody: boolean;
  bodyDescription?: string;
}
