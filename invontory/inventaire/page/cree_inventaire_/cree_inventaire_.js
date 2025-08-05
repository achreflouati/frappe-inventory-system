frappe.pages['cree-inventaire-'].on_page_load = function(wrapper) {
    // Ajoute la classe pour afficher le sidebar ERPNext
    $(wrapper).addClass('page-with-sidebar');
    console.log('Sidebar class added:', $(wrapper).hasClass('page-with-sidebar'));

    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Créer un inventaire',
        single_column: true
    });

    new InventaireUI(page);
};

class InventaireUI {
	constructor(page) {
		this.page = page;
		this.inventaire_data = [];
		this.current_inventaire = null;
		this.is_loading = false;
		
		this.init();
	}

	async init() {
		this.render_main_form();
		this.bind_events();
		await this.load_depots();
		this.generate_reference();
	}

	render_main_form() {
		const html = `
			<div class="p-3">
				<div class="row">
					<div class="col-md-6">
						<div class="form-group">
							<label class="form-label">Référence Inventaire</label>
							<div id="ref_display" class="inventory-ref-display">
								<span id="ref_text">INV-0000001</span>
							</div>
						</div>
					</div>
					<div class="col-md-6">
						<div class="form-group">
							<label class="form-label">Date Ouverture</label>
							<input type="date" class="form-control" id="date_ouverture" value="${frappe.datetime.get_today()}">
						</div>
					</div>
				</div>

				<div class="form-group mt-3">
					<label class="form-label">Dépôt</label>
					<select class="form-control" id="depot_filter">
						<option value="">-- Sélectionner un dépôt --</option>
					</select>
				</div>

				<div class="mt-3 d-flex gap-2">
					<button class="btn btn-secondary" id="btn_rechercher">
						<i class="fa fa-search"></i> Rechercher Inventaires
					</button>
					<button class="btn btn-primary" id="btn_creer_inventaire">
						<i class="fa fa-plus"></i> Créer Inventaire
					</button>
					<button class="btn btn-success" id="btn_sauvegarder" style="display:none;">
						<i class="fa fa-save"></i> Sauvegarder
					</button>
					<button class="btn btn-danger" id="btn_cloturer" style="display:none;">
						<i class="fa fa-lock"></i> Clôturer Inventaire
					</button>
				</div>

				<div id="loading_indicator" class="mt-3" style="display:none;">
					<div class="text-center">
						<i class="fa fa-spinner fa-spin"></i> Chargement...
					</div>
				</div>

				<hr/>

				<div id="table_inventaires" class="mt-3"></div>

				<div id="comptage_section" class="mt-5" style="display:none;">
					<div class="d-flex justify-content-between align-items-center mb-3">
						<h4>Comptage des Articles</h4>
						<div>
							<button class="btn btn-info btn-sm" id="btn_toggle_stock">
								<i class="fa fa-eye"></i> Afficher Stock Réel
							</button>
							<span class="badge badge-info ml-2" id="total_items">0 articles</span>
						</div>
					</div>
					
					<div class="table-responsive">
						<table class="table table-bordered table-striped">
							<thead class="thead-dark">
								<tr>
									<th>Article</th>
									<th>Nom Article</th>
									<th>Stock Réel</th>
									<th>Compté</th>
									<th>Écart</th>
									<th>Statut</th>
								</tr>
							</thead>
							<tbody id="comptage_table_body">
								<!-- Lignes dynamiques ici -->
							</tbody>
						</table>
					</div>
					
					<div class="mt-3 p-3 bg-light rounded">
						<div class="row">
							<div class="col-md-4">
								<strong>Total Articles:</strong> <span id="stat_total">0</span>
							</div>
							<div class="col-md-4">
								<strong>Articles Comptés:</strong> <span id="stat_comptes">0</span>
							</div>
							<div class="col-md-4">
								<strong>Écarts Détectés:</strong> <span id="stat_ecarts">0</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;

		this.page.main.html(html);
		this.add_custom_styles();
	}

	add_custom_styles() {
		const style = `
			<style>
				.inventory-ref-display {
					font-family: 'Courier New', monospace;
					font-size: 20px;
					background: #000;
					color: #00ff00;
					padding: 10px;
					border-radius: 4px;
					text-align: center;
					max-width: 200px;
				}
				
				.ecart-positive {
					color: #28a745;
					font-weight: bold;
				}
				
				.ecart-negative {
					color: #dc3545;
					font-weight: bold;
				}
				
				.comptage-complete {
					background-color: #d4edda;
				}
				
				.comptage-incomplete {
					background-color: #f8d7da;
				}
				
				.btn-group-custom {
					gap: 10px;
				}
			</style>
		`;
		$('head').append(style);
	}

	bind_events() {
		const me = this;

		// Recherche inventaire
		$('#btn_rechercher').on('click', () => this.rechercher_inventaires());

		// Créer inventaire
		$('#btn_creer_inventaire').on('click', () => this.creer_inventaire());

		// Sauvegarder
		$('#btn_sauvegarder').on('click', () => this.sauvegarder_inventaire());

		// Clôturer
		$('#btn_cloturer').on('click', () => this.cloturer_inventaire());

		// Toggle affichage stock réel
		$('#btn_toggle_stock').on('click', () => this.toggle_stock_display());

		// Calcul de l'écart en temps réel
		$(document).on('input', '.comptage', function () {
			me.calculate_ecart($(this));
			me.update_statistics();
		});

		// Validation des champs
		$(document).on('blur', '.comptage', function () {
			me.validate_comptage($(this));
		});

		// Changement de dépôt
		$('#depot_filter').on('change', () => {
			$('#comptage_section').hide();
			$('#table_inventaires').empty();
		});
	}

	async load_depots() {
		try {
			this.show_loading(true);
			const response = await this.frappe_call('frappe.client.get_list', {
				doctype: 'Warehouse',
				fields: ['name', 'warehouse_name'],
				order_by: 'name'
			});

			if (response && response.message) {
				const select = $('#depot_filter');
				response.message.forEach(depot => {
					select.append(`<option value="${depot.name}">${depot.warehouse_name || depot.name}</option>`);
				});
			}
		} catch (error) {
			this.show_error('Erreur lors du chargement des dépôts');
		} finally {
			this.show_loading(false);
		}
	}

	async rechercher_inventaires() {
		const depot = $('#depot_filter').val();
		if (!depot) {
			frappe.msgprint('Veuillez sélectionner un dépôt.');
			return;
		}

		try {
			this.show_loading(true);
			const response = await this.frappe_call('frappe.client.get_list', {
				doctype: 'Inventaire NE',
				filters: { depot },
				fields: ['name', 'ref_inventaire', 'date_ouverture', 'statut'],
				limit_page_length: 50,
				order_by: 'creation desc'
			});

			if (response && response.message) {
				this.display_inventaires(response.message);
			}
		} catch (error) {
			this.show_error('Erreur lors de la recherche');
		} finally {
			this.show_loading(false);
		}
	}

	async creer_inventaire() {
		const depot = $('#depot_filter').val();
		if (!depot) {
			frappe.msgprint('Veuillez sélectionner un dépôt.');
			return;
		}

		try {
			this.show_loading(true);
			const response = await this.frappe_call('frappe.client.get_list', {
				doctype: 'Bin',
				filters: { warehouse: depot },
				fields: ['item_code', 'actual_qty'],
				limit_page_length: 1000,
				order_by: 'item_code'
			});

			if (response && response.message && response.message.length > 0) {
				await this.load_item_details(response.message);
				this.render_comptage_table(response.message);
				this.show_comptage_section();
			} else {
				frappe.msgprint("Aucun article trouvé dans ce dépôt.");
			}
		} catch (error) {
			this.show_error('Erreur lors de la création de l\'inventaire');
		} finally {
			this.show_loading(false);
		}
	}

	async load_item_details(items) {
		const item_codes = items.map(item => item.item_code);
		
		try {
			const response = await this.frappe_call('frappe.client.get_list', {
				doctype: 'Item',
				filters: { name: ['in', item_codes] },
				fields: ['name', 'item_name', 'stock_uom'],
				limit_page_length: 1000
			});

			if (response && response.message) {
				const item_details = {};
				response.message.forEach(item => {
					item_details[item.name] = item;
				});

				items.forEach(item => {
					const details = item_details[item.item_code];
					if (details) {
						item.item_name = details.item_name;
						item.stock_uom = details.stock_uom;
					}
				});
			}
		} catch (error) {
			console.error('Erreur lors du chargement des détails articles:', error);
		}
	}

	render_comptage_table(items) {
		let html = '';
		items.forEach((item, index) => {
			html += `
				<tr data-item-code="${item.item_code}">
					<td>${item.item_code}</td>
					<td>${item.item_name || item.item_code}</td>
					<td class="stock-reel-cell" style="display:none;">
						<input type="hidden" class="stock-reel" value="${item.actual_qty}">
						<span class="stock-value">${item.actual_qty} ${item.stock_uom || ''}</span>
					</td>
					<td>
						<input type="number" 
							   class="form-control comptage" 
							   data-stock="${item.actual_qty}"
							   data-item="${item.item_code}"
							   step="0.01"
							   min="0"
							   placeholder="Quantité comptée">
					</td>
					<td>
						<span class="ecart-value">-</span>
					</td>
					<td>
						<span class="badge badge-secondary statut">Non compté</span>
					</td>
				</tr>
			`;
		});
		
		$('#comptage_table_body').html(html);
		$('#total_items').text(`${items.length} articles`);
		this.update_statistics();
	}

	show_comptage_section() {
		$('#comptage_section').show();
		$('#btn_sauvegarder').show();
		$('#btn_cloturer').show();
	}

	calculate_ecart($input) {
		const $row = $input.closest('tr');
		const stock_reel = parseFloat($input.data('stock')) || 0;
		const compte = parseFloat($input.val()) || 0;
		const ecart = compte - stock_reel;
		
		const $ecartCell = $row.find('.ecart-value');
		
		if ($input.val() === '') {
			$ecartCell.text('-');
			$ecartCell.removeClass('ecart-positive ecart-negative');
			$row.find('.statut').removeClass('badge-success badge-warning').addClass('badge-secondary').text('Non compté');
			$row.removeClass('comptage-complete').addClass('comptage-incomplete');
		} else {
			$ecartCell.text(ecart.toFixed(2));
			
			if (ecart > 0) {
				$ecartCell.removeClass('ecart-negative').addClass('ecart-positive');
				$row.find('.statut').removeClass('badge-secondary badge-success').addClass('badge-warning').text('Surplus');
			} else if (ecart < 0) {
				$ecartCell.removeClass('ecart-positive').addClass('ecart-negative');
				$row.find('.statut').removeClass('badge-secondary badge-success').addClass('badge-warning').text('Manque');
			} else {
				$ecartCell.removeClass('ecart-positive ecart-negative');
				$row.find('.statut').removeClass('badge-secondary badge-warning').addClass('badge-success').text('Conforme');
			}
			
			$row.removeClass('comptage-incomplete').addClass('comptage-complete');
		}
	}

	validate_comptage($input) {
		const value = parseFloat($input.val());
		if (value < 0) {
			$input.val(0);
			frappe.msgprint('La quantité ne peut pas être négative');
		}
	}

	update_statistics() {
		const total = $('#comptage_table_body tr').length;
		const comptes = $('#comptage_table_body .comptage').filter(function() {
			return $(this).val() !== '';
		}).length;
		const ecarts = $('#comptage_table_body .ecart-value').filter(function() {
			return $(this).text() !== '-' && parseFloat($(this).text()) !== 0;
		}).length;

		$('#stat_total').text(total);
		$('#stat_comptes').text(comptes);
		$('#stat_ecarts').text(ecarts);
	}

	toggle_stock_display() {
		const $stockCells = $('.stock-reel-cell');
		const $btn = $('#btn_toggle_stock');
		
		if ($stockCells.is(':visible')) {
			$stockCells.hide();
			$btn.html('<i class="fa fa-eye"></i> Afficher Stock Réel');
		} else {
			$stockCells.show();
			$btn.html('<i class="fa fa-eye-slash"></i> Masquer Stock Réel');
		}
	}

	async sauvegarder_inventaire() {
		const depot = $('#depot_filter').val();
		const date_ouverture = $('#date_ouverture').val();
		const ref_inventaire = $('#ref_text').text();
		
		if (!depot || !date_ouverture) {
			frappe.msgprint('Veuillez remplir tous les champs obligatoires');
			return;
		}

		const inventaire_lines = this.collect_inventaire_data();
		
		try {
			this.show_loading(true);
			await this.frappe_call('frappe.client.insert', {
    doc: {
        doctype: 'Inventaire NE',
        ref_inventaire: ref_inventaire,
        date_ouverture: date_ouverture,
        depot: depot,
        statut: 'Ouvert',
        inventaire_item: inventaire_lines.map(line => ({
			doctype: 'Inventaire Item',
            item_code: line.item_code,
            stock_reel: line.stock_reel,
            compte: line.compte,
            ecart: line.ecart
        }))
    }
});

			
			frappe.msgprint('Inventaire sauvegardé avec succès!');
			this.generate_reference();
			
		} catch (error) {
			this.show_error('Erreur lors de la sauvegarde');
		} finally {
			this.show_loading(false);
		}
	}

	collect_inventaire_data() {
		const lines = [];
		$('#comptage_table_body tr').each(function() {
			const $row = $(this);
			const item_code = $row.data('item-code');
			const stock_reel = parseFloat($row.find('.stock-reel').val()) || 0;
			const comte = parseFloat($row.find('.comptage').val()) || 0;
			const ecart = comte - stock_reel;
			
			if ($row.find('.comptage').val() !== '') {
				lines.push({
					item_code,
					stock_reel,
					compte: comte,
					ecart
				});
			}
		});
		
		return lines;
	}

	async cloturer_inventaire() {
		const lines = this.collect_inventaire_data();
		const total_comptes = lines.length;
		const total_items = $('#comptage_table_body tr').length;
		
		if (total_comptes < total_items) {
			const confirm = await this.frappe_call('frappe.client.set_value', {
    doctype: 'Inventaire NE',
    name: inventaire_name,
    fieldname: 'statut',
    value: 'Clôturé'
});

			
			if (!confirm) return;
		}
		
		try {
			this.show_loading(true);
			
			// Logique de clôture
			frappe.msgprint('Inventaire clôturé avec succès!');
			
			// Réinitialiser l'interface
			$('#comptage_section').hide();
			$('#btn_sauvegarder').hide();
			$('#btn_cloturer').hide();
			this.generate_reference();
			
		} catch (error) {
			this.show_error('Erreur lors de la clôture');
		} finally {
			this.show_loading(false);
		}
	}

	display_inventaires(data) {
		if (!data || data.length === 0) {
			$('#table_inventaires').html('<div class="text-center text-muted">Aucun inventaire trouvé</div>');
			return;
		}

		let html = `
			<div class="table-responsive">
				<table class="table table-striped">
					<thead class="thead-light">
						<tr>
							<th>Nom</th>
							<th>Référence</th>
							<th>Date</th>
							<th>Statut</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						${data.map(i => `
							<tr>
								<td>${i.name}</td>
								<td><code>${i.ref_inventaire}</code></td>
								<td>${frappe.datetime.str_to_user(i.date_ouverture)}</td>
								<td>
									<span class="badge badge-${i.statut === 'Ouvert' ? 'success' : 'secondary'}">
										${i.statut || 'Ouvert'}
									</span>
								</td>
								<td>
									<button class="btn btn-sm btn-primary" onclick="frappe.call({
    method: 'frappe.client.get',
    args: {
        doctype: 'Inventaire NE',
        name: '${i.name}'
    },
    callback: function(r) {
        if (r.message) {
            const d = new frappe.ui.Dialog({
                title: 'Détails de invnetaire',
                fields: [
                    { label: 'Référence', fieldname: 'ref_inventaire', fieldtype: 'Data', default: r.message.ref_inventaire, read_only: 1 },
                    { label: 'Date Ouverture', fieldname: 'date_ouverture', fieldtype: 'Date', default: r.message.date_ouverture, read_only: 1 },
                    { label: 'Dépôt', fieldname: 'depot', fieldtype: 'Link', options: 'Warehouse', default: r.message.depot, read_only: 1 },
                    { label: 'Statut', fieldname: 'statut', fieldtype: 'Data', default: r.message.statut, read_only: 1 }
                ],
                primary_action_label: 'Fermer',
                primary_action() {
                    d.hide();
                }
            });
            d.show();
        }
    }
})">
	<i class="fa fa-eye"></i> Voir
</button>

								</td>
							</tr>
						`).join('')}
					</tbody>
				</table>
			</div>
		`;
		$('#table_inventaires').html(html);
	}

	generate_reference() {
		// Générer une référence unique
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const time = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
		
		const ref = `INV-${year}${month}${day}-${time}`;
		$('#ref_text').text(ref);
	}

	// Méthodes utilitaires
	async frappe_call(method, args) {
		return new Promise((resolve, reject) => {
			frappe.call({
				method,
				args,
				callback: function(response) {
					if (response.exc) {
						reject(new Error(response.exc));
					} else {
						resolve(response);
					}
				}
			});
		});
	}

	show_loading(show) {
		this.is_loading = show;
		if (show) {
			$('#loading_indicator').show();
		} else {
			$('#loading_indicator').hide();
		}
	}

	show_error(message) {
		frappe.msgprint({
			title: 'Erreur',
			message: message,
			indicator: 'red'
		});
	}

	async confirm_dialog(title, message) {
		return new Promise((resolve) => {
			frappe.confirm(message, () => resolve(true), () => resolve(false));
		});
	}
}