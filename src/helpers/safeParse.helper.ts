export function safeParse(string: string): any | null {
    try {
        return JSON.parse(string);
    } catch (e) {
        console.error(e);
        return null;
    }
}