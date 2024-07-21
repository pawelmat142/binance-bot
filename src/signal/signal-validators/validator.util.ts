export abstract class ValidatorUtil {

    public static isShort(line: string): boolean {
        return /\bshort\b/i.test(line)
    }

    public static isLong(line: string): boolean {
        return /\blong\b/i.test(line)
    }

    public static isBuy(line: string): boolean {
        return /\bbuy\b/i.test(line)
    }

    public static isSell(line: string): boolean {
        return /\bsell\b/i.test(line)
    }

    public static isUsdt(line: string): boolean {
        return /\busdt\b/i.test(line)
    }

    public static removeNonCharacters(str: string): string {
        const regex = /[^a-zA-Z]/g;
        return str.replace(regex, '');
    }

}