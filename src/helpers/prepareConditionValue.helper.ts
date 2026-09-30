import { PreparedConditionValueType } from "#/types/PreparedConditionValue.type";
import { ConditionType } from "#modules/postgres/types/Condition.type";
import { safeParse } from "./safeParse.helper";

export function prepareConditionValue(condition_type: ConditionType, condition_value: string): PreparedConditionValueType {
    if (!condition_value || condition_value === '') {
        return undefined;
    }
    switch (condition_type) {
        // >=
        case 'larger_or_equal':
        // >
        case 'larger_not_equal':
        // <=
        case 'less_or_equal':
        // <
        case 'less_not_equal':
        case 'equal':
        // !==
        case 'not_equal': {
            // если булевое
            if (condition_value === 'true' || condition_value === 'false') {
                return condition_value === 'true';
            }
            // если число
            const numericValue = Number(condition_value);
            if (!isNaN(numericValue)) {
                return numericValue;
            }
            // если строка
            return condition_value;
        }
        // [] || Set()
        case 'in_array':
        // [] || Set()
        case 'not_in_array': {
            const array = safeParse(condition_value);
            return array ? new Set(array) : undefined;
        }
        default:
            return undefined;
    }
}