export function formatNumber(num: number): string {
    const absNum = Math.abs(num);
    if (absNum < 1000) {
        return num.toString().substring(0, 5);
    }

    const suffixes = ['k', 'm', 'b', 't'];
    const log = Math.log10(absNum);
    let thousands = Math.floor(log / 3);
    let scaled = absNum / Math.pow(10, thousands * 3);

    // Handle overflow to next suffix
    if (scaled >= 1000) {
        scaled /= 1000;
        thousands++;
    }

    let formatted: string;
    if (scaled >= 100) {
        formatted = Math.round(scaled).toString();
    } else if (scaled >= 10) {
        formatted = scaled.toFixed(1).replace(/\.0$/, '');
    } else {
        formatted = scaled.toFixed(2).replace(/\.00$/, '').replace(/\.0$/, '');
    }

    const suffix = suffixes[thousands - 1] || '';
    const result = (num < 0 ? '-' : '') + formatted + suffix;
    return result.substring(0, 5);
}
