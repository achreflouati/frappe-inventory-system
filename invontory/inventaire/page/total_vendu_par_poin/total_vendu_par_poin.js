frappe.pages['total-vendu-par-poin'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Total vendu par points de vente',
        single_column: true
    });

    new TotalVenduParPoinPage(page);
};

class TotalVenduParPoinPage {
    constructor(page) {
        this.page = page;
        this.current_data = [];
        this.init();
    }

    async init() {
        this.render_filters();
        this.bind_events();
    }

    render_filters() {
        const html = `
            <div class="card mb-3 p-3">
                <div class="form-row align-items-end">
                    <div class="col-md-3 mb-2">
                        <label class="font-weight-bold">Date début</label>
                        <input type="date" id="date_debut" class="form-control" value="${frappe.datetime.get_today()}">
                    </div>
                    <div class="col-md-3 mb-2">
                        <label class="font-weight-bold">Date fin</label>
                        <input type="date" id="date_fin" class="form-control" value="${frappe.datetime.get_today()}">
                    </div>
                    <div class="col-md-4 mb-2">
                        <label class="font-weight-bold">Point de vente</label>
                        <select id="point_vente_select" class="form-control">
                            <option value="">-- Tous les points de vente --</option>
                        </select>
                    </div>
                    <div class="col-md-2 mb-2">
                        <button class="btn btn-primary btn-block" id="btn_filter">
                            <i class="fa fa-filter"></i> Filtrer
                        </button>
                        <button class="btn btn-success btn-block mt-2" id="btn_export">
                            <i class="fa fa-file-excel"></i> Exporter Excel
                        </button>
                    </div>
                </div>
            </div>
            <div id="result_table"></div>
        `;
        this.page.main.html(html);
        this.load_points_vente();
    }

    bind_events() {
        $('#btn_filter').on('click', () => this.load_data());
        $('#btn_export').on('click', () => this.export_excel());
    }

    async load_points_vente() {
        try {
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Sales Invoice',
                    fields: ['customer'],
                    limit_page_length: 1000,
                    order_by: 'customer'
                }
            });

            if (response.message) {
                const clients = new Set(response.message.map(inv => inv.customer));
                clients.forEach(client => {
                    $('#point_vente_select').append(`<option value="${client}">${client}</option>`);
                });
            }
        } catch (error) {
            frappe.msgprint('Erreur lors du chargement des clients');
        }
    }

    async load_data() {
        const date_debut = $('#date_debut').val();
        const date_fin = $('#date_fin').val();
        const point_vente = $('#point_vente_select').val();

        if (!date_debut || !date_fin) {
            frappe.msgprint('Veuillez saisir une plage de dates valide');
            return;
        }

        this.show_loading(true);

        try {
            const filters = {
                date_debut,
                date_fin,
                point_vente
            };

            const response = await frappe.call({
                method: 'invontory.api.get_factures',
                args: filters
            });

            if (response.message) {
                this.current_data = response.message;
                this.render_table(response.message);
            }
        } catch (error) {
            frappe.msgprint('Erreur lors du chargement des données');
        } finally {
            this.show_loading(false);
        }
    }

    render_table(data) {
        if (!data.length) {
            $('#result_table').html('<div class="alert alert-warning text-center">Aucune facture trouvée</div>');
            return;
        }

        let total = data.reduce((sum, row) => sum + row.grand_total, 0);

        let summary = `
            <div class="mb-2 d-flex justify-content-between align-items-center">
                <span>
                    <span class="badge badge-info mr-2">${data.length} facture${data.length > 1 ? 's' : ''}</span>
                    <strong>Total général :</strong> <span class="badge badge-success">${total.toFixed(2)} TND</span>
                </span>
            </div>
        `;

        let html = `
            ${summary}
            <div class="table-responsive">
                <table class="table table-bordered table-hover table-striped">
                    <thead class="thead-light">
                        <tr>
                            <th>Facture</th>
                            <th>Client</th>
                            <th>Date</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>
                                <td><span class="badge badge-secondary">${row.name}</span></td>
                                <td>${row.customer}</td>
                                <td>${frappe.datetime.str_to_user(row.posting_date)}</td>
                                <td class="text-right font-weight-bold">${row.grand_total.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <th colspan="3" class="text-right">Total général</th>
                            <th class="text-right">${total.toFixed(2)}</th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        $('#result_table').html(html);
    }

    export_excel() {
        if (!this.current_data || this.current_data.length === 0) {
            frappe.msgprint('Aucune donnée à exporter');
            return;
        }

        let csv = 'Facture;Client;Date;Total\n';
        this.current_data.forEach(row => {
            csv += `"${row.name}";"${row.customer}";"${frappe.datetime.str_to_user(row.posting_date)}";"${row.grand_total.toFixed(2)}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `total_vendu_point_vente_${frappe.datetime.get_today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    show_loading(show) {
        if (show) {
            if (!$('#custom_loading').length) {
                $('body').append(`
                    <div id="custom_loading" style="
                        position: fixed; top:0; left:0; width:100vw; height:100vh;
                        background: rgba(255,255,255,0.7); z-index:9999; display:flex; align-items:center; justify-content:center; display:none;">
                        <div>
                            <i class="fa fa-spinner fa-spin fa-3x text-primary"></i>
                            <div class="mt-2 text-center font-weight-bold">Chargement des factures...</div>
                        </div>
                    </div>
                `);
            }
            $('#custom_loading').fadeIn(200);
        } else {
            $('#custom_loading').fadeOut(200);
        }
    }
}
