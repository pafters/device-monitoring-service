import { LiveHadledValueType } from "#/types/LiveHadledValue.type";
import { FLOAT_COMPARE_PRECISION } from "#constants/FloatComparePrecision";

// сюда передаются предварительно обработанные value, condition_value исходя из типа алиаса
export function checkOnConditionValue(
    condition_type: string,
    condition_value: any,
    value: LiveHadledValueType
): boolean {
    switch (condition_type) {
        // >=
        case 'larger_or_equal': {
            return value >= condition_value;
        }
        // >
        case 'larger_not_equal': {
            return value > condition_value;
        }
        // <=
        case 'less_or_equal': {
            return value <= condition_value;
        }
        // <
        case 'less_not_equal': {
            return value < condition_value;
        }
        // ===
        case 'equal': {
            if (typeof value === 'number' && typeof condition_value === 'number') {
                const diff = Math.abs(value - condition_value);
                const isNumberEqual = diff < FLOAT_COMPARE_PRECISION;
                return isNumberEqual;
            }
            return condition_value === value;
        }
        // !==
        case 'not_equal': {
            if (typeof value === 'number' && typeof condition_value === 'number') {
                const diff = Math.abs(value - condition_value);
                const isNumberEqual = diff < FLOAT_COMPARE_PRECISION;
                return isNumberEqual;
            }
            return condition_value !== value;
        }
        // [].indexOf() !== -1 || Set().has === true
        case 'in_array': {
            return condition_value.has(value) === true;
        }
        // [].indexOf() === -1  || Set().has === false
        case 'not_in_array': {
            return condition_value.has(value) === false;
        }
        default: {
            throw new Error(`condition_type="${condition_type}" is not valid`);
        }
    }
}