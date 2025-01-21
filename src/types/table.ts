export class Table {

    columns: Column[]
    rows: any[][]

    constructor(columns: Column[], rows: any[][]) {
        this.columns = columns;
        this.rows = rows;
    }

    static isTable(o: any): boolean {
        return o.columns
            && o.rows
            && Array.isArray(o.rows)
            && Array.isArray(o.columns)
    }
}

interface Column {
    text: string
    type: string
    sort?: boolean
    desc?: boolean
}
