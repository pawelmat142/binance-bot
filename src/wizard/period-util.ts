import { Period } from "../binance/model/model";

export abstract class PeriodUtil {

    private static readonly monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]

    public static thisMonth(): Period {
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        return {
            from: startOfMonth.getTime(),
            to: Date.now()
        }
    }

    public static lastMonth(): Period {
        const now = new Date();

        // Get the current year and month
        const year = now.getFullYear();
        const month = now.getMonth();

        // Determine the previous month and year
        const prevMonth = (month === 0) ? 11 : month - 1;
        const prevMonthYear = (month === 0) ? year - 1 : year;

        // Start of the last month
        const startOfLastMonth = new Date(prevMonthYear, prevMonth, 1);

        // End of the last month (last day of the previous month)
        const endOfLastMonth = new Date(prevMonthYear, prevMonth + 1, 0);

        // Timestamps in milliseconds
        const from = startOfLastMonth.getTime();
        const to = endOfLastMonth.getTime();

        return { from, to }
    }
    
    public static monthBeforeMonths(monthsBefore: number): Period {
        const now = new Date();
        const targetMonthStart = new Date(now.getFullYear(), now.getMonth() - monthsBefore, 1);
        const targetMonthEnd = new Date(now.getFullYear(), now.getMonth() - monthsBefore + 1, 0, 23, 59, 59, 999);
      
        return {
          from: targetMonthStart.getTime(),
          to: targetMonthEnd.getTime()
        };

    }

    public static nameOfMonthBefore(monthsBefore: number): string {
        const now = new Date();
        const monthBefore = new Date(now.getFullYear(), now.getMonth() - monthsBefore)
        return this.monthNames[monthBefore.getMonth()];
    }

}