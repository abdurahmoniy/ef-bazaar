import { normalizePlayerList } from './marketplace-format';
import type {
  ListingAttributeDefinition,
  ListingAttributes,
  ListingCreateRequest,
} from './marketplace-types';

export const ATTRIBUTE_FIELD_PREFIX = 'attr.';

interface FormAttributeDefinition extends ListingAttributeDefinition {
  legacyFieldName?: string;
}

export const SEEDED_LISTING_ATTRIBUTE_DEFINITIONS: FormAttributeDefinition[] = [
  {
    key: 'highest_division_level',
    labelUz: 'Eng yuqori division',
    type: 'INT',
    required: true,
    position: 10,
    groupKey: 'gameplay',
    constraints: { min: 1, max: 9 },
    legacyFieldName: 'highestDivisionLevel',
  },
  {
    key: 'team_strength',
    labelUz: 'Team Strength',
    type: 'INT',
    required: true,
    position: 20,
    groupKey: 'squad',
    constraints: { min: 0 },
    legacyFieldName: 'teamStrength',
  },
  {
    key: 'valuable_players',
    labelUz: "Yulduz o'yinchilar",
    type: 'CARD_LIST',
    required: false,
    position: 30,
    groupKey: 'squad',
    constraints: { max_items: 12 },
    legacyFieldName: 'valuablePlayers',
  },
  {
    key: 'android_coins',
    labelUz: 'Android coin',
    type: 'INT',
    required: true,
    position: 40,
    groupKey: 'monetization',
    constraints: { min: 0 },
    legacyFieldName: 'androidCoins',
  },
  {
    key: 'ios_coins',
    labelUz: 'iOS coin',
    type: 'INT',
    required: true,
    position: 50,
    groupKey: 'monetization',
    constraints: { min: 0 },
    legacyFieldName: 'iosCoins',
  },
  {
    key: 'has_google_play_link',
    labelUz: 'Google Play link mavjud',
    type: 'BOOLEAN',
    required: false,
    position: 60,
    groupKey: 'monetization',
    constraints: {},
    legacyFieldName: 'hasGooglePlayLink',
  },
];

function textField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(formData: FormData, key: string) {
  const raw = textField(formData, key);
  if (!raw) return Number.NaN;

  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function buildAttributeFieldName(key: string) {
  return `${ATTRIBUTE_FIELD_PREFIX}${key}`;
}

/**
 * Builds a {@link ListingCreateRequest} from the create-form fields. Attribute
 * keys are driven by the backend AttributeDefinition rows. The legacy hardcoded
 * field names remain as fallback inputs so older tests and rendered pages keep
 * producing the same seeded payload.
 */
export function createListingRequestFromForm(
  formData: FormData,
  definitions: readonly ListingAttributeDefinition[] = SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
): ListingCreateRequest | string {
  const description = textField(formData, 'description');
  const price = numberField(formData, 'price');

  if (description.length < 10) return "Tavsif kamida 10 ta belgidan iborat bo'lishi kerak";
  if (price < 0) return "Raqamli maydonlar manfiy bo'lmasligi kerak";
  if (!Number.isFinite(price)) {
    return "Raqamli maydonlarni to'ldiring";
  }

  const attributeResult = collectAttributes(formData, definitions);
  if (typeof attributeResult === 'string') return attributeResult;

  return {
    description,
    price,
    priceNegotiable: formData.get('priceNegotiable') === 'on',
    attributes: attributeResult,
  };
}

function collectAttributes(
  formData: FormData,
  definitions: readonly ListingAttributeDefinition[],
): ListingAttributes | string {
  const attributes: ListingAttributes = {};
  const activeDefinitions = definitions
    .filter((definition) => definition.active !== false)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  for (const definition of activeDefinitions) {
    const parsed = parseAttributeValue(formData, definition);
    if (!parsed.ok) return parsed.error;
    if (!parsed.omit) attributes[definition.key] = parsed.value;
  }

  return attributes;
}

type AttributeParseResult =
  | { ok: true; value: unknown; omit?: false }
  | { ok: true; omit: true }
  | { ok: false; error: string };

function parseAttributeValue(
  formData: FormData,
  definition: ListingAttributeDefinition,
): AttributeParseResult {
  if (definition.type === 'BOOLEAN') {
    return {
      ok: true,
      value: checkboxField(formData, definition),
    };
  }

  const raw = attributeTextField(formData, definition);
  if (!raw) {
    return definition.required
      ? { ok: false, error: `${definition.labelUz} maydonini to'ldiring` }
      : { ok: true, omit: true };
  }

  switch (definition.type) {
    case 'INT':
      return parseIntegerAttribute(definition, raw);
    case 'DECIMAL':
      return parseDecimalAttribute(definition, raw);
    case 'LIST_STRING':
      return parseListStringAttribute(definition, raw);
    case 'ENUM':
      return parseEnumAttribute(definition, raw);
    case 'STRING':
      return parseTextAttribute(definition, raw, false);
    case 'TEXT':
      return parseTextAttribute(definition, raw, true);
    default:
      return { ok: false, error: `${definition.labelUz} turi qo'llab-quvvatlanmaydi` };
  }
}

function parseIntegerAttribute(
  definition: ListingAttributeDefinition,
  raw: string,
): AttributeParseResult {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    return { ok: false, error: `${definition.labelUz} butun son bo'lishi kerak` };
  }

  const rangeError = validateNumberRange(definition, value);
  if (rangeError) return { ok: false, error: rangeError };
  return { ok: true, value };
}

function parseDecimalAttribute(
  definition: ListingAttributeDefinition,
  raw: string,
): AttributeParseResult {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${definition.labelUz} son bo'lishi kerak` };
  }

  const rangeError = validateNumberRange(definition, value);
  if (rangeError) return { ok: false, error: rangeError };
  return { ok: true, value };
}

function parseListStringAttribute(
  definition: ListingAttributeDefinition,
  raw: string,
): AttributeParseResult {
  const values = normalizePlayerList(raw);
  if (values.length === 0) {
    return definition.required
      ? { ok: false, error: `${definition.labelUz} maydonini to'ldiring` }
      : { ok: true, omit: true };
  }

  const itemMaxLength = numberConstraint(definition, 'item_max_length');
  if (itemMaxLength !== undefined) {
    const tooLong = values.find((value) => value.length > itemMaxLength);
    if (tooLong) {
      return {
        ok: false,
        error: `${definition.labelUz} elementi ${itemMaxLength} belgidan oshmasligi kerak`,
      };
    }
  }

  return { ok: true, value: values };
}

function parseEnumAttribute(
  definition: ListingAttributeDefinition,
  raw: string,
): AttributeParseResult {
  const options = stringListConstraint(definition, 'options');
  if (options.length > 0 && !options.includes(raw)) {
    return { ok: false, error: `${definition.labelUz} noto'g'ri tanlangan` };
  }

  return { ok: true, value: raw };
}

function parseTextAttribute(
  definition: ListingAttributeDefinition,
  raw: string,
  multiline: boolean,
): AttributeParseResult {
  const value = multiline ? raw : raw.trim();
  const maxLength = numberConstraint(definition, 'max_length');
  if (maxLength !== undefined && value.length > maxLength) {
    return {
      ok: false,
      error: `${definition.labelUz} ${maxLength} belgidan oshmasligi kerak`,
    };
  }

  return { ok: true, value };
}

function attributeTextField(formData: FormData, definition: ListingAttributeDefinition) {
  const fieldNames = attributeFieldNames(definition);
  for (const fieldName of fieldNames) {
    const value = textField(formData, fieldName);
    if (value) return value;
  }
  return '';
}

function checkboxField(formData: FormData, definition: ListingAttributeDefinition) {
  return attributeFieldNames(definition).some((fieldName) => {
    const value = formData.get(fieldName);
    return value === 'on' || value === 'true';
  });
}

function attributeFieldNames(definition: ListingAttributeDefinition) {
  const names = [buildAttributeFieldName(definition.key)];
  const legacyFieldName = (definition as FormAttributeDefinition).legacyFieldName;
  if (legacyFieldName) names.push(legacyFieldName);
  return names;
}

function validateNumberRange(definition: ListingAttributeDefinition, value: number) {
  const min = numberConstraint(definition, 'min');
  const max = numberConstraint(definition, 'max');

  if (min !== undefined && value < min) {
    return `${definition.labelUz} ${min} dan kichik bo'lmasligi kerak`;
  }
  if (max !== undefined && value > max) {
    return `${definition.labelUz} ${max} dan katta bo'lmasligi kerak`;
  }
  return null;
}

function numberConstraint(definition: ListingAttributeDefinition, key: string) {
  const raw = definition.constraints?.[key];
  const value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

function stringListConstraint(definition: ListingAttributeDefinition, key: string) {
  const raw = definition.constraints?.[key];
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Collects the {@code files} entries from the form. Empty files (0 bytes) are
 * filtered out to sidestep browsers that submit a placeholder even when the
 * input is untouched.
 */
export function collectListingFiles(formData: FormData): File[] {
  return formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}
