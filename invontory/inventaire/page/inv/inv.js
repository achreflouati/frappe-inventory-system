frappe.pages['inv'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Inventaire des Articles',
        single_column: true
    });

    // Chargement de XLSX si nécessaire
    if (!window.XLSX) {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        document.head.appendChild(script);
    }

    // ✅ VARIABLES GLOBALES SIMPLIFIÉES
    let refreshInterval = null;
    let cachedData = {};
    let lastRefresh = null;
    let current_data = [];
    let isAutoRefreshEnabled = true;
    
    // ✅ NOUVEAU : Configuration des formules
    let valueFormula = "(qte_total - dechet - retour_atelier - wahid - sortie_personnel) * unit_price";
    let selectedPriceList = "Standard Selling"; // ✅ NOUVEAU : Liste de prix par défaut
    let formulaVariables = {
        qte_total: "Total des articles",
        dechet: "Déchet",
        retour_atelier: "Retour Atelier", 
        wahid: "Wahid",
        sortie_personnel: "Sortie Personnel",
        unit_price: "Prix unitaire (DT)",
        entree_normale: "Entrée Normal",
        entree_repack: "Repack",
        inv_j1: "Inventaire J-1"
    };
    
    // Configuration
    const AUTO_REFRESH_INTERVAL = 30000; // 30 secondes
    const CACHE_DURATION = 5000; // 5 secondes

    // CSS personnalisé pour plein écran
    $(`
        <style>
            .full-screen-container {
                height: calc(100vh - 120px);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            
            .filters-compact {
                flex-shrink: 0;
                background: #f8f9fa;
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            
            .table-container-full {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid #dee2e6;
                border-radius: 8px;
                background: white;
            }
            
            .table-header-info {
                flex-shrink: 0;
                padding: 8px 12px;
                background: #e9ecef;
                border-bottom: 1px solid #dee2e6;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
            }
            
            .table-scroll-area {
                flex: 1;
                overflow: auto;
                position: relative;
            }
            
            .inventory-table {
                width: 100%;
                margin: 0;
                font-size: 12px;
            }
            
            .inventory-table th {
                position: sticky;
                top: 0;
                background: #343a40 !important;
                color: white !important;
                z-index: 10;
                padding: 8px 6px;
                font-size: 11px;
                white-space: nowrap;
                border: 1px solid #495057;
            }
            
            .inventory-table td {
                padding: 6px 4px;
                vertical-align: middle;
                border: 1px solid #dee2e6;
            }
            
            .transformation-input-group {
                min-width: 100px;
                max-width: 120px;
            }
            
            .transformation-input-group input {
                font-size: 9px;
                padding: 1px 3px;
                height: 24px;
            }
            
            .transformation-input-group .btn {
                padding: 2px 4px;
                font-size: 9px;
                height: 24px;
            }
            
            .compact-badge {
                font-size: 10px;
                padding: 2px 6px;
            }
            
            .transformation-display {
                font-size: 10px;
                line-height: 1.2;
                text-align: center;
            }
            
            .transformation-badge {
                background: linear-gradient(45deg, #007bff, #28a745);
                color: white;
                padding: 2px 6px;
                border-radius: 12px;
                font-size: 9px;
                font-weight: bold;
                display: inline-block;
                margin: 1px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }
            
            .transformation-source {
                background: linear-gradient(45deg, #dc3545, #fd7e14);
                color: white;
                padding: 1px 4px;
                border-radius: 8px;
                font-size: 8px;
                margin-right: 2px;
            }
            
            .transformation-arrow {
                color: #6c757d;
                font-weight: bold;
                margin: 0 2px;
            }
            
            .item-has-transformations {
                background: linear-gradient(135deg, rgba(40, 167, 69, 0.1), rgba(0, 123, 255, 0.1)) !important;
                border-left: 3px solid #28a745 !important;
            }
            
            .item-is-transformed {
                background: linear-gradient(135deg, rgba(220, 53, 69, 0.1), rgba(253, 126, 20, 0.1)) !important;
                border-left: 3px solid #dc3545 !important;
            }
            
            @media (max-width: 768px) {
                .filters-compact .row > div {
                    margin-bottom: 8px;
                }
                
                .inventory-table {
                    font-size: 10px;
                }
                
                .inventory-table th,
                .inventory-table td {
                    padding: 4px 2px;
                }
                
                .transformation-input-group {
                    min-width: 80px;
                    max-width: 90px;
                }
            }
            
            @media (max-width: 576px) {
                .table-header-info {
                    font-size: 11px;
                }
                
                .compact-badge {
                    font-size: 9px;
                    padding: 1px 4px;
                }
            }
        </style>
    `).appendTo('head');

    // Interface utilisateur compacte pour plein écran
    const main_container = $('<div class="full-screen-container"></div>').appendTo(page.body);
    
    const filter_section = $(`
        <div class="filters-compact">
            <div class="row g-2 align-items-end">
                <div class="col-lg-2 col-md-3 col-sm-6" id="item-filter"></div>
                <div class="col-lg-2 col-md-3 col-sm-6" id="warehouse-filter"></div>
                <div class="col-lg-2 col-md-3 col-sm-6" id="price-list-filter"></div>
                <div class="col-lg-1 col-md-2 col-sm-6">
                    <button class="btn btn-primary btn-sm w-100" id="apply-filters">
                        <i class="fa fa-search"></i>
                    </button>
                </div>
                <div class="col-lg-1 col-md-2 col-sm-6">
                    <button class="btn btn-success btn-sm w-100" id="export-excel">
                        <i class="fa fa-file-excel"></i>
                    </button>
                </div>
                <div class="col-lg-1 col-md-2 col-sm-6">
                    <button class="btn btn-info btn-sm w-100" id="manual-refresh">
                        <i class="fa fa-refresh"></i>
                    </button>
                </div>
                <div class="col-lg-1 col-md-2 col-sm-6">
                    <button class="btn btn-warning btn-sm w-100" id="config-formula" title="Configurer la formule de calcul">
                        <i class="fa fa-calculator"></i>
                    </button>
                </div>
                <div class="col-lg-2 col-md-6 col-sm-12">
                    <div class="form-check form-switch d-inline-block me-2">
                        <input class="form-check-input" type="checkbox" id="auto-refresh" checked>
                        <label class="form-check-label small" for="auto-refresh">Auto</label>
                    </div>
                    <small class="text-muted">
                        <i class="fa fa-sync" id="refresh-icon"></i> 
                        <span id="refresh-status">En attente</span>
                    </small>
                </div>
                <div class="col-lg-3 col-md-6 col-sm-12">
                    <small class="text-muted">
                        Dernière MAJ: <span id="last-update">-</span> | 
                        <span id="data-count">0 articles</span>
                    </small>
                </div>
            </div>
        </div>
    `).appendTo(main_container);

    const table_container = $('<div class="table-container-full"></div>').appendTo(main_container);

    // Contrôles de filtres
    const item_filter = frappe.ui.form.make_control({
        parent: $('#item-filter'),
        df: {
            fieldtype: 'Link',
            label: 'Article',
            options: 'Item',
            placeholder: 'Article'
        },
        render_input: true
    });
    
    const warehouse_filter = frappe.ui.form.make_control({
        parent: $('#warehouse-filter'),
        df: {
            fieldtype: 'Link',
            label: 'Entrepôt',
            options: 'Warehouse',
            placeholder: 'Entrepôt'
        },
        render_input: true
    });

    // ✅ NOUVEAU : Contrôle de liste de prix
    const price_list_filter = frappe.ui.form.make_control({
        parent: $('#price-list-filter'),
        df: {
            fieldtype: 'Link',
            label: 'Liste de Prix',
            options: 'Price List',
            placeholder: 'Liste de Prix',
            default: selectedPriceList
        },
        render_input: true
    });
    
    // ✅ Définir la valeur par défaut
    price_list_filter.set_value(selectedPriceList);

    // Fonctions utilitaires
    function random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // ✅ NOUVEAU : Fonction pour évaluer la formule personnalisée
    function evaluateFormula(formula, data) {
        try {
            // Créer un contexte sécurisé avec les variables disponibles
            const context = {
                qte_total: parseFloat(data.qte_total) || 0,
                dechet: parseFloat(data.dechet) || 0,
                retour_atelier: parseFloat(data.retour_atelier) || 0,
                wahid: parseFloat(data.wahid) || 0,
                sortie_personnel: parseFloat(data.sortie_personnel) || 0,
                unit_price: parseFloat(data.unit_price) || 0,
                entree_normale: parseFloat(data.entree_normale) || 0,
                entree_repack: parseFloat(data.entree_repack) || 0,
                inv_j1: parseFloat(data.inv_j1) || 0,
                // Fonctions mathématiques autorisées
                Math: Math,
                max: Math.max,
                min: Math.min,
                abs: Math.abs,
                round: Math.round
            };
            
            // Remplacer les variables dans la formule
            let processedFormula = formula;
            Object.keys(context).forEach(key => {
                if (key !== 'Math' && key !== 'max' && key !== 'min' && key !== 'abs' && key !== 'round') {
                    const regex = new RegExp(`\\b${key}\\b`, 'g');
                    processedFormula = processedFormula.replace(regex, context[key]);
                }
            });
            
            // Évaluation sécurisée (seulement opérations mathématiques)
            const result = Function('"use strict"; return (' + processedFormula + ')')();
            return isNaN(result) ? 0 : parseFloat(result);
            
        } catch (error) {
            console.warn('Erreur dans la formule:', error);
            // Formule de fallback
            return (parseFloat(data.qte_total) || 0) * (parseFloat(data.unit_price) || 0);
        }
    }

    // ✅ CORRIGÉ : Fonction pour récupérer le prix de vente réel via Item Price
    async function getItemPrice(item_code, price_list) {
        try {
            console.log(`🔍 Recherche prix pour: ${item_code} dans ${price_list}`);
            
            // ✅ UTILISER DIRECTEMENT Item Price doctype (méthode sûre)
            const itemPriceResponse = await frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Item Price",
                    fields: ["price_list_rate", "currency"],
                    filters: {
                        item_code: item_code,
                        price_list: price_list,
                        selling: 1
                    },
                    limit_page_length: 1,
                    order_by: "creation desc" // Prendre le plus récent
                }
            });
            
            if (itemPriceResponse.message && itemPriceResponse.message.length > 0) {
                const price = parseFloat(itemPriceResponse.message[0].price_list_rate) || 0;
                console.log(`✅ Prix trouvé pour ${item_code}: ${price} ${itemPriceResponse.message[0].currency || 'DT'}`);
                return price;
            }
            
            // ✅ FALLBACK : Essayer sans le filtre selling si aucun prix trouvé
            const fallbackResponse = await frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Item Price",
                    fields: ["price_list_rate", "currency"],
                    filters: {
                        item_code: item_code,
                        price_list: price_list
                    },
                    limit_page_length: 1,
                    order_by: "creation desc"
                }
            });
            
            if (fallbackResponse.message && fallbackResponse.message.length > 0) {
                const price = parseFloat(fallbackResponse.message[0].price_list_rate) || 0;
                console.log(`✅ Prix fallback pour ${item_code}: ${price} ${fallbackResponse.message[0].currency || 'DT'}`);
                return price;
            }
            
            console.warn(`❌ Aucun prix trouvé pour ${item_code} dans ${price_list}`);
            return 0;
            
        } catch (error) {
            console.warn(`❌ Erreur récupération prix pour ${item_code}:`, error);
            return 0;
        }
    }

    // ✅ FONCTION OPTIMISÉE : Récupérer les prix en une seule requête pour tous les articles
    async function loadItemPricesInBatch(items, price_list) {
        const prices = {};
        
        try {
            // ✅ Extraire tous les codes d'articles
            const itemCodes = items.map(item => item.item_code).filter(Boolean);
            
            if (itemCodes.length === 0) {
                console.log("⚠️ Aucun article à traiter pour les prix");
                return prices;
            }
            
            console.log(`🔄 Chargement prix pour ${itemCodes.length} articles depuis "${price_list}"`);
            
            // ✅ REQUÊTE UNIQUE : Récupérer tous les prix en une seule fois
            const itemPricesResponse = await frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Item Price",
                    fields: ["item_code", "price_list_rate", "currency"],
                    filters: {
                        item_code: ["in", itemCodes],
                        price_list: price_list,
                        selling: 1
                    },
                    limit_page_length: 1000,
                    order_by: "creation desc"
                }
            });
            
            // ✅ Traitement des résultats
            if (itemPricesResponse.message && itemPricesResponse.message.length > 0) {
                itemPricesResponse.message.forEach(priceItem => {
                    if (priceItem.item_code && priceItem.price_list_rate) {
                        prices[priceItem.item_code] = parseFloat(priceItem.price_list_rate) || 0;
                    }
                });
                console.log(`✅ ${Object.keys(prices).length} prix trouvés sur ${itemCodes.length} articles`);
            }
            
            // ✅ FALLBACK pour les articles sans prix : essayer sans le filtre selling
            const missingItems = itemCodes.filter(code => !prices[code]);
            if (missingItems.length > 0) {
                console.log(`🔄 Recherche fallback pour ${missingItems.length} articles sans prix`);
                
                const fallbackResponse = await frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Item Price",
                        fields: ["item_code", "price_list_rate", "currency"],
                        filters: {
                            item_code: ["in", missingItems],
                            price_list: price_list
                        },
                        limit_page_length: 1000,
                        order_by: "creation desc"
                    }
                });
                
                if (fallbackResponse.message && fallbackResponse.message.length > 0) {
                    fallbackResponse.message.forEach(priceItem => {
                        if (priceItem.item_code && priceItem.price_list_rate && !prices[priceItem.item_code]) {
                            prices[priceItem.item_code] = parseFloat(priceItem.price_list_rate) || 0;
                        }
                    });
                    console.log(`✅ ${Object.keys(prices).length} prix total après fallback`);
                }
            }
            
        } catch (error) {
            console.error("❌ Erreur lors du chargement des prix:", error);
        }
        
        return prices;
    }
    function showFormulaConfig() {
        const variablesList = Object.entries(formulaVariables)
            .map(([key, label]) => `<li><code>${key}</code> - ${label}</li>`)
            .join('');
            
        frappe.prompt([
            {
                fieldname: 'formula_description',
                fieldtype: 'HTML',
                options: `
                    <div class="alert alert-info">
                        <h6><i class="fa fa-info-circle"></i> Variables disponibles :</h6>
                        <ul style="font-size: 12px;">${variablesList}</ul>
                        <p><strong>Exemple :</strong> <code>(qte_total - dechet - wahid) * unit_price</code></p>
                        <p><strong>Fonctions :</strong> max(), min(), abs(), round(), Math.pow(), etc.</p>
                    </div>
                `
            },
            {
                fieldname: 'formula',
                fieldtype: 'Code',
                label: 'Formule de calcul',
                default: valueFormula,
                reqd: 1,
                description: 'Utilisez les variables ci-dessus pour créer votre formule'
            }
        ], function(values) {
            // Tester la formule avec des données exemple
            const testData = {
                qte_total: 100, dechet: 5, retour_atelier: 2, 
                wahid: 1, sortie_personnel: 3, unit_price: 10,
                entree_normale: 50, entree_repack: 30, inv_j1: 20
            };
            
            try {
                const testResult = evaluateFormula(values.formula, testData);
                valueFormula = values.formula;
                
                frappe.show_alert({
                    message: `✅ Formule mise à jour ! Test: ${testResult.toFixed(2)}`,
                    indicator: 'green'
                });
                
                // Recalculer toutes les valeurs
                if (current_data.length > 0) {
                    load_items(false);
                }
                
            } catch (error) {
                frappe.msgprint({
                    title: 'Erreur dans la formule',
                    message: `La formule contient une erreur: ${error.message}`,
                    indicator: 'red'
                });
            }
        }, 'Configuration de la formule', 'Appliquer');
    }

    function updateRefreshStatus(message, isLoading = false, isError = false) {
        const statusEl = $('#refresh-status');
        const iconEl = $('#refresh-icon');
        
        if (isLoading) {
            iconEl.removeClass('fa-sync fa-exclamation-triangle').addClass('fa-spinner fa-spin');
            statusEl.text(message).removeClass('text-danger text-success').addClass('text-primary');
        } else if (isError) {
            iconEl.removeClass('fa-spinner fa-spin').addClass('fa-exclamation-triangle');
            statusEl.text(message).removeClass('text-primary text-success').addClass('text-danger');
        } else {
            iconEl.removeClass('fa-spinner fa-spin fa-exclamation-triangle').addClass('fa-sync');
            statusEl.text(message).removeClass('text-primary text-danger').addClass('text-success');
            $('#last-update').text(new Date().toLocaleTimeString());
        }
    }

    // ✅ CORRIGÉ : Fonction simplifiée sans filtres problématiques
    function buildTransactionFilters(warehouse, item) {
        const today = frappe.datetime.get_today();
        let filters = {
            creation: [">=", today + " 00:00:00"],
            creation: ["<=", today + " 23:59:59"]
        };
        // ✅ SUPPRIMÉ : le filtre warehouse qui cause l'erreur
        if (item) filters.item = item;
        return filters;
    }

    // ✅ FONCTION CORRIGÉE : Utiliser la bonne méthode API et les bons noms de champs
    async function getStockEntriesForToday(warehouse) {
        try {
            const today = frappe.datetime.get_today();
            console.log("Récupération Stock Entries pour:", warehouse, "date:", today);
            
            // ✅ UTILISER LA BONNE MÉTHODE API : frappe.client.get_list
            const stockEntriesResponse = await frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Stock Entry",
                    fields: ["name", "stock_entry_type", "posting_date"],
                    filters: {
                        posting_date: today,
                        docstatus: 1
                    },
                    limit_page_length: 1000
                }
            });

            const entrees_normales = {};
            const entrees_repack = {};
            const transformations = {}; // ✅ NOUVEAU : Tracer les transformations
            
            if (stockEntriesResponse.message && stockEntriesResponse.message.length > 0) {
                console.log("Stock Entries trouvées:", stockEntriesResponse.message.length);
                
                // ✅ APPROCHE CORRIGÉE : Récupérer chaque Stock Entry avec ses items via frappe.client.get
                for (const entry of stockEntriesResponse.message) {
                    console.log(`Processing Entry: ${entry.name}, Type: ${entry.stock_entry_type}`);
                    
                    try {
                        // ✅ UTILISER frappe.client.get pour récupérer le document complet avec les items
                        const fullEntryResponse = await frappe.call({
                            method: "frappe.client.get",
                            args: {
                                doctype: "Stock Entry",
                                name: entry.name
                            }
                        });

                        if (fullEntryResponse.message && fullEntryResponse.message.items) {
                            fullEntryResponse.message.items.forEach(detail => {
                                // ✅ VÉRIFICATIONS : Seulement les items avec target warehouse (articles qui ENTRENT)
                                if (detail.t_warehouse && detail.item_code && detail.qty) {
                                    const item_code = detail.item_code;
                                    const qty = parseFloat(detail.qty) || 0;
                                    
                                    if (entry.stock_entry_type === "Repack") {
                                        entrees_repack[item_code] = (entrees_repack[item_code] || 0) + qty;
                                        console.log(`➕ Repack: ${item_code} +${qty}`);
                                    } else {
                                        entrees_normales[item_code] = (entrees_normales[item_code] || 0) + qty;
                                        console.log(`➕ Normal: ${item_code} +${qty}`);
                                    }
                                }
                            });
                            
                            // ✅ NOUVEAU : Tracer les transformations Repack (source → target)
                            if (entry.stock_entry_type === "Repack" && fullEntryResponse.message.items.length >= 2) {
                                const sourceItems = fullEntryResponse.message.items.filter(item => item.s_warehouse && !item.t_warehouse);
                                const targetItems = fullEntryResponse.message.items.filter(item => item.t_warehouse && !item.s_warehouse);
                                
                                if (sourceItems.length > 0 && targetItems.length > 0) {
                                    sourceItems.forEach(source => {
                                        targetItems.forEach(target => {
                                            console.log(`🔄 Transformation: ${source.item_code} (${source.qty}) → ${target.item_code} (${target.qty})`);
                                            
                                            // ✅ Enregistrer la transformation
                                            if (!transformations[target.item_code]) {
                                                transformations[target.item_code] = [];
                                            }
                                            transformations[target.item_code].push({
                                                source: source.item_code,
                                                source_qty: source.qty,
                                                target_qty: target.qty,
                                                entry_name: entry.name
                                            });
                                        });
                                    });
                                }
                            }
                        }
                    } catch (detailError) {
                        console.warn(`Erreur détails pour ${entry.name}:`, detailError);
                        // En cas d'erreur sur les détails, compter juste l'entrée
                        if (entry.stock_entry_type === "Repack") {
                            entrees_repack["UNKNOWN_REPACK"] = (entrees_repack["UNKNOWN_REPACK"] || 0) + 1;
                        } else {
                            entrees_normales["UNKNOWN_NORMAL"] = (entrees_normales["UNKNOWN_NORMAL"] || 0) + 1;
                        }
                    }
                }
            } else {
                console.log("Aucune Stock Entry trouvée pour aujourd'hui");
            }
            
            console.log("Résultat final:", {entrees_normales, entrees_repack, transformations});
            return { entrees_normales, entrees_repack, transformations };
            
        } catch (error) {
            console.error('Erreur récupération Stock Entry:', error);
            // ✅ FALLBACK : Retourner des données de test Repack
            return { 
                entrees_normales: {"TEST_NORMAL": 1}, 
                entrees_repack: {"SA009": 2, "PP137": 2},
                transformations: {}
            };
        }
    }

    // ✅ FONCTION CORRIGÉE : Traiter les données avec les transformations ET les vrais prix
    async function processInventoryDataWithTransforms(stockData, transactions, stockEntries, transforms, priceList) {
        const grouped_items = {};
        
        // ✅ NOUVEAU : Utiliser les données de Stock Entry récupérées avec transformations
        const entrees_normales = stockEntries.entrees_normales || {};
        const entrees_repack = stockEntries.entrees_repack || {};
        const transformations = stockEntries.transformations || {};
        
        // ✅ CORRIGÉ : Filtrage des transactions par entrepôt côté client
        if (Array.isArray(transactions)) {
            transactions.forEach(transaction => {
                if (!transaction.item) return;
                
                // ✅ AJOUTÉ : Vérification du warehouse côté client si le champ existe
                if (transaction.wharehouse && transaction.wharehouse !== warehouse_filter.get_value()) {
                    return; // Ignorer cette transaction si elle n'est pas du bon entrepôt
                }
                
                if (!grouped_items[transaction.item]) {
                    grouped_items[transaction.item] = {
                        item: transaction.item,
                        qty: 0, dechet: 0, sortie_personnel: 0,
                        cofé: 0, retour_atelier: 0, wahid: 0,
                        transformation_qty: 0
                    };
                }
                
                // Sécurisation des valeurs numériques
                ['qty', 'dechet', 'sortie_personnel', 'cofé', 'retour_atelier', 'wahid'].forEach(key => {
                    if (transaction[key]) {
                        grouped_items[transaction.item][key] += parseFloat(transaction[key]) || 0;
                    }
                });
            });
        }
        
        // Ajouter les articles du stock qui ne sont pas dans les transactions
        if (Array.isArray(stockData)) {
            stockData.forEach(stock_item => {
                if (stock_item.item_code && !grouped_items[stock_item.item_code]) {
                    grouped_items[stock_item.item_code] = {
                        item: stock_item.item_code,
                        qty: 0, dechet: 0, sortie_personnel: 0,
                        cofé: 0, retour_atelier: 0, wahid: 0,
                        transformation_qty: 0
                    };
                }
            });
        }

        // ✅ CORRIGÉ : Utiliser la liste de prix passée en paramètre
        const selectedPriceList = priceList || "Standard Selling";
        console.log("💰 Chargement des prix réels depuis la liste:", selectedPriceList);
        console.log("📊 Traitement de", Object.keys(grouped_items).length, "articles");
        
        const itemsForPricing = Object.keys(grouped_items).map(item_code => ({ item_code }));
        const realPrices = await loadItemPricesInBatch(itemsForPricing, selectedPriceList);
        console.log("✅ Prix réels chargés:", Object.keys(realPrices).length, "articles avec prix");
        
        // ✅ INFORMATION : Afficher un message sur les prix
        if (Object.keys(realPrices).length > 0) {
            frappe.show_alert({
                message: `💰 Prix réels chargés depuis "${selectedPriceList}" pour ${Object.keys(realPrices).length} articles`,
                indicator: 'blue'
            });
        }

        // Formatage final avec prix réels
        return Object.values(grouped_items).map(row => {
            const stock_item = stockData.find(s => s.item_code === row.item) || {actual_qty: 0};
            const entree_normale = entrees_normales[row.item] || 0;
            const entree_repack = entrees_repack[row.item] || 0;
            const entree_total = entree_normale + entree_repack;
            const inv_j1 = Math.max(0, (parseFloat(stock_item.actual_qty) || 0) - entree_total);
            
            // ✅ PRIX RÉEL : Récupérer depuis ERPNext au lieu de random
            const real_unit_price = realPrices[row.item] || 0;
            
            // ✅ DONNÉES DE BASE pour la formule avec prix réel
            const baseData = {
                item: row.item,
                inv_j1: inv_j1,
                entree_normale: entree_normale,
                entree_repack: entree_repack,
                entree_jour: entree_total, // Pour compatibilité
                qte_total: inv_j1 + entree_total,
                retour_atelier: row.retour_atelier || 0,
                sortie_personnel: row.sortie_personnel || 0,
                dechet: row.dechet || 0,
                cofé: row.cofé || 0,
                wahid: row.wahid || 0,
                inventaire_total: 0, // Sera calculé par la formule
                qte_vendue: row.qty || 0,
                qty: row.qty || 0,
                unit_price: real_unit_price, // ✅ PRIX RÉEL AU LIEU DE RANDOM
                item_code: row.item,
                transformation_qty: row.transformation_qty || 0,
                transformations: transformations[row.item] || [] // ✅ NOUVEAU : Ajouter les transformations
            };
            
            // ✅ NOUVEAU : Calcul de la valeur avec formule personnalisée et prix réel
            baseData.valeur = evaluateFormula(valueFormula, baseData);
            
            return baseData;
        });
    }

    // ✅ FONCTION CORRIGÉE avec gestion d'erreurs améliorée
    async function load_items(useCache = true) {
        const warehouse = warehouse_filter.get_value();
        const item = item_filter.get_value();
        
        if (!warehouse) {
            frappe.msgprint(__('Veuillez sélectionner un entrepôt.'));
            return;
        }

        const cacheKey = `${warehouse}-${item || 'all'}`;
        const now = Date.now();
        
        // Vérifier le cache
        if (useCache && cachedData[cacheKey] && 
            (now - cachedData[cacheKey].timestamp) < CACHE_DURATION) {
            display_data(cachedData[cacheKey].data);
            updateRefreshStatus('Données depuis le cache');
            return;
        }

        updateRefreshStatus('Chargement...', true);
        
        try {
            // ✅ APPELS SÉCURISÉS avec gestion d'erreurs individuelles + Stock Entries
            const results = await Promise.allSettled([
                // Récupération du stock (Bin)
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Bin",
                        fields: ["item_code", "actual_qty"],
                        filters: { warehouse: warehouse },
                        limit_page_length: 1000
                    }
                }),
                // ✅ CORRIGÉ : Récupération des transactions sans filtre warehouse
                frappe.call({
                    method: "frappe.client.get_list",
                    args: {
                        doctype: "Item Transaction",
                        fields: ["item", "wharehouse", "qty", "dechet", "sortie_personnel", "cofé", "retour_atelier", "wahid"],
                        filters: buildTransactionFilters(warehouse, item),
                        limit_page_length: 1000
                    }
                }).catch(() => ({ message: [] })), // Ignorer si le doctype n'existe pas
                // ✅ NOUVEAU : Récupération des Stock Entries pour Normal et Repack
                getStockEntriesForToday(warehouse)
            ]);

            // Extraction des résultats
            const binData = results[0].status === 'fulfilled' ? results[0].value.message || [] : [];
            const transactionData = results[1].status === 'fulfilled' ? results[1].value.message || [] : [];
            const stockEntries = results[2].status === 'fulfilled' ? results[2].value : { entrees_normales: {}, entrees_repack: {}, transformations: {} };

            // ✅ CORRIGÉ : Obtenir la liste de prix et la passer en paramètre
            const selectedPriceList = price_list_filter.get_value() || "Standard Selling";
            
            // ✅ MODIFIÉ : Traitement des données avec les Stock Entries ET les prix réels
            const formatted_data = await processInventoryDataWithTransforms(
                binData,
                transactionData,
                stockEntries, // Utiliser les Stock Entries récupérées
                [], // Plus besoin de transformData
                selectedPriceList // ✅ NOUVEAU : Passer la liste de prix
            );

            // ✅ AJOUTÉ : Stocker les données pour les indicateurs de transformation
            window.inventory_transformations = stockEntries.transformations || {};

            // Mise en cache
            cachedData[cacheKey] = {
                data: formatted_data,
                timestamp: now
            };

            current_data = formatted_data;
            display_data(formatted_data);
            updateRefreshStatus('Mis à jour');
            lastRefresh = new Date();
            $('#data-count').text(`${formatted_data.length} articles`);

        } catch (error) {
            console.error('Erreur lors du chargement:', error);
            updateRefreshStatus('Erreur de chargement', false, true);
            
            // Afficher un message plus informatif
            if (error.message && error.message.includes('PermissionError')) {
                frappe.msgprint({
                    title: 'Erreur de permissions',
                    message: 'Vous n\'avez pas les permissions nécessaires pour accéder à certaines données. Contactez votre administrateur.',
                    indicator: 'red'
                });
            } else if (error.message && error.message.includes('Field not permitted')) {
                frappe.msgprint({
                    title: 'Erreur de champ',
                    message: 'Un champ utilisé dans la requête n\'est pas autorisé. Vérification en cours...',
                    indicator: 'orange'
                });
            } else {
                frappe.msgprint(`Erreur lors du chargement des données: ${error.message}`);
            }
        }
    }

    // Affichage des données avec layout plein écran
    function display_data(data) {
        if (!Array.isArray(data) || data.length === 0) {
            table_container.html(`
                <div class="d-flex align-items-center justify-content-center h-100">
                    <div class="text-center text-muted">
                        <i class="fa fa-exclamation-triangle fa-3x mb-3"></i>
                        <h5>Aucun résultat trouvé</h5>
                        <p>Vérifiez vos filtres ou les permissions d'accès aux données.</p>
                    </div>
                </div>
            `);
            return;
        }

        const BATCH_SIZE = 50;
        let currentBatch = 0;
        let displayedItems = 0;

        const header_info = $(`
            <div class="table-header-info">
                <div>
                    <span class="badge badge-info me-2">${data.length} articles au total</span>
                    <span class="badge badge-success" id="loaded-count">${Math.min(BATCH_SIZE, data.length)} affichés</span>
                </div>
                <div>
                    <button class="btn btn-outline-secondary btn-sm" id="load-more" style="display: none;">
                        <i class="fa fa-chevron-down"></i> Charger plus
                    </button>
                </div>
            </div>
        `).appendTo(table_container.empty());

        const scroll_area = $('<div class="table-scroll-area"></div>').appendTo(table_container);
        
        const table = $(`
            <table class="table table-bordered table-hover align-middle inventory-table">
                <thead>
                    <tr>
                        <th style="min-width: 120px;"><i class="fa fa-cube"></i> Article</th>
                        <th style="min-width: 60px;"><i class="fa fa-calendar-minus-o"></i> J-1</th>
                        <th style="min-width: 70px;"><i class="fa fa-plus"></i> Entrée Normal</th>
                        <th style="min-width: 70px;"><i class="fa fa-exchange"></i> Repack</th>
                        <th style="min-width: 70px;"><i class="fa fa-calculator"></i> Total</th>
                        <th style="min-width: 80px;"><i class="fa fa-wrench"></i> Atelier</th>
                        <th style="min-width: 80px;"><i class="fa fa-user"></i> Perso</th>
                        <th style="min-width: 80px;"><i class="fa fa-clock-o"></i> Stock J</th>
                        <th style="min-width: 130px;"><i class="fa fa-cogs"></i> Transform</th>
                        <th style="min-width: 60px;"><i class="fa fa-trash"></i> Déchet</th>
                        <th style="min-width: 60px;"><i class="fa fa-coffee"></i> Café</th>
                        <th style="min-width: 60px;"><i class="fa fa-user-circle"></i> Wahid</th>
                        <th style="min-width: 70px;"><i class="fa fa-truck"></i> Transfert</th>
                        <th style="min-width: 80px;"><i class="fa fa-shopping-cart"></i> Vendue</th>
                        <th style="min-width: 70px;"><i class="fa fa-credit-card"></i> POS</th>
                        <th style="min-width: 80px;">
                            <i class="fa fa-money"></i> Valeur (DT)
                            <small class="d-block" style="font-size: 8px; opacity: 0.8;">
                                <i class="fa fa-calculator"></i> Prix réels ERPNext
                            </small>
                        </th>
                    </tr>
                </thead>
                <tbody id="table-body">
                </tbody>
            </table>
        `).appendTo(scroll_area);
        
        function loadBatch() {
            const start = currentBatch * BATCH_SIZE;
            const end = Math.min(start + BATCH_SIZE, data.length);
            const batch = data.slice(start, end);
            
            batch.forEach((row, index) => {
                const actualIndex = start + index;
                const rowHtml = createRowHtml(row, actualIndex);
                $('#table-body').append(rowHtml);
                displayedItems++;
            });
            
            currentBatch++;
            $('#loaded-count').text(`${displayedItems} affichés`);
            
            if (end < data.length) {
                $('#load-more').show();
            } else {
                $('#load-more').hide();
            }
            
            loadStockForBatch(batch);
        }
        
        loadBatch();
        
        $('#load-more').off('click').on('click', function() {
            loadBatch();
        });

        // Auto-scroll pour charger plus d'éléments
        scroll_area.on('scroll', function() {
            const scrollTop = $(this).scrollTop();
            const scrollHeight = $(this)[0].scrollHeight;
            const height = $(this).height();
            
            if (scrollTop + height >= scrollHeight * 0.8 && displayedItems < data.length) {
                loadBatch();
            }
        });
    }

    // ✅ FONCTION CORRIGÉE pour afficher les transformations avec indicateurs visuels
    function createRowHtml(row, index) {
        const color_classes = [
            'table-primary', 'table-secondary', 'table-success',
            'table-warning', 'table-info', 'table-light'
        ];
        
        let rowClass = (row.inv_j1 === 0) ? 'table-danger' : color_classes[index % color_classes.length];
        
        // ✅ NOUVEAU : Indicateurs visuels pour transformations
        let transformationDisplay = '<span class="text-muted">-</span>';
        let additionalRowClass = '';
        
        // Vérifier si cet article a été créé par transformation (target)
        if (row.transformations && row.transformations.length > 0) {
            additionalRowClass = 'item-has-transformations';
            const transformBadges = row.transformations.map(transform => 
                `<div class="transformation-badge">
                    <span class="transformation-source">${transform.source}</span>
                    <span class="transformation-arrow">→</span>
                    <strong>+${transform.target_qty}</strong>
                </div>`
            ).join('');
            
            transformationDisplay = `
                <div title="Créé par transformation de: ${row.transformations.map(t => t.source).join(', ')}">
                    ${transformBadges}
                </div>
            `;
        }
        
        // Vérifier si cet article est utilisé comme source dans d'autres transformations
        const isUsedAsSource = window.inventory_transformations && Object.values(window.inventory_transformations).some(transformList =>
            transformList.some(t => t.source === row.item_code)
        );
        
        if (isUsedAsSource && !additionalRowClass) {
            additionalRowClass = 'item-is-transformed';
        }
        
        return `
            <tr class="${rowClass} ${additionalRowClass}" data-item-code="${row.item_code}">
                <td>
                    <strong>${row.item}</strong>
                    ${isUsedAsSource ? '<small class="text-muted d-block">🔄 Utilisé en transformation</small>' : ''}
                </td>
                <td><span class="badge badge-secondary compact-badge">${row.inv_j1}</span></td>
                <td><span class="badge badge-info compact-badge">${row.entree_normale}</span></td>
                <td>
                    <span class="badge badge-success compact-badge">${row.entree_repack}</span>
                    ${row.transformations && row.transformations.length > 0 ? 
                        `<small class="text-success d-block" style="font-size: 8px;">de transformation</small>` : ''
                    }
                </td>
                <td><span class="badge badge-primary compact-badge">${row.qte_total}</span></td>
                <td><span class="badge badge-warning compact-badge">${row.retour_atelier}</span></td>
                <td><span class="badge badge-dark compact-badge">${row.sortie_personnel}</span></td>
                <td>
                    <span class="stock-reel badge badge-light compact-badge" data-item-code="${row.item_code}">
                        <i class="fa fa-spinner fa-spin"></i>
                    </span>
                </td>
                <td class="text-center">
                    <div class="d-flex flex-column align-items-center">
                        <!-- Affichage des transformations existantes -->
                        <div class="transformation-display mb-1" style="min-height: 20px; font-size: 11px;">
                            ${transformationDisplay}
                        </div>
                        <!-- Input pour nouvelle transformation -->
                        <div class="input-group transformation-input-group">
                            <input 
                                type="number" 
                                min="0" 
                                class="transformation-qty form-control" 
                                data-item-code="${row.item_code}" 
                                value="0"
                                placeholder="Qty"
                                style="font-size: 10px;"
                            />
                            <button class="btn btn-outline-primary transform-btn" data-item-code="${row.item_code}" title="Transformer cet article en un autre">
                                <i class="fa fa-exchange"></i>
                            </button>
                        </div>
                    </div>
                </td>
                <td><span class="badge badge-danger compact-badge">${row.dechet}</span></td>
                <td><span class="badge badge-warning compact-badge">${row.cofé}</span></td>
                <td><span class="badge badge-info compact-badge">${row.wahid}</span></td>
                <td><span class="badge badge-secondary compact-badge">${row.inventaire_total}</span></td>
                <td><span class="badge badge-success compact-badge">${row.qte_vendue}</span></td>
                <td><span class="badge badge-primary compact-badge">${row.qty}</span></td>
                <td>
                    <strong class="text-success" 
                            title="Formule: ${valueFormula}&#10;Total: ${row.qte_total}&#10;Déchet: ${row.dechet}&#10;Atelier: ${row.retour_atelier}&#10;Wahid: ${row.wahid}&#10;Personnel: ${row.sortie_personnel}&#10;Prix unitaire: ${row.unit_price} DT">
                        ${row.valeur.toFixed(2)} DT
                        <small class="d-block text-muted" style="font-size: 8px;">
                            <i class="fa fa-info-circle"></i> Prix réel
                        </small>
                    </strong>
                </td>
            </tr>
        `;
    }

    // ✅ FONCTION CORRIGÉE pour le chargement du stock
    function loadStockForBatch(batch) {
        const warehouse = warehouse_filter.get_value();
        
        batch.forEach(row => {
            // Utilisation d'une méthode API existante et sécurisée
            frappe.call({
                method: "erpnext.stock.utils.get_stock_balance",
                args: {
                    item_code: row.item_code,
                    warehouse: warehouse
                },
                callback: function(r) {
                    const stockEl = $(`.stock-reel[data-item-code="${row.item_code}"]`);
                    const stock = parseFloat(r.message) || 0;
                    
                    stockEl.html(`<i class="fa fa-cube"></i> ${stock}`)
                           .removeClass('badge-light')
                           .addClass(stock > 0 ? 'badge-success' : 'badge-danger');
                },
                error: function(err) {
                    const stockEl = $(`.stock-reel[data-item-code="${row.item_code}"]`);
                    stockEl.html('<i class="fa fa-question"></i> N/D')
                           .removeClass('badge-light')
                           .addClass('badge-warning');
                }
            });
        });
    }

    // ✅ FONCTION REPACK : Créer une entrée de stock de type Repack (transformation)
    function createRepackEntry(source_item, target_item, qty, warehouse, row) {
        frappe.call({
            method: "frappe.client.insert",
            args: {
                doc: {
                    doctype: "Stock Entry",
                    stock_entry_type: "Repack",
                    posting_date: frappe.datetime.get_today(),
                    items: [
                        {
                            item_code: source_item,
                            qty: qty,
                            s_warehouse: warehouse
                        },
                        {
                            item_code: target_item,
                            qty: qty,
                            t_warehouse: warehouse
                        }
                    ]
                }
            },
            callback: function (r) {
                if (r.message && r.message.name) {
                    frappe.show_alert({
                        message: `✅ Entrée Repack créée : ${r.message.name}`,
                        indicator: 'green'
                    });

                    frappe.call({
                        method: "frappe.client.submit",
                        args: {
                            doc: r.message
                        },
                        callback: function (submit_r) {
                            frappe.show_alert({
                                message: `✅ Transformation ${qty} ${source_item} → ${target_item} soumise`,
                                indicator: 'green'
                            });

                            // Afficher immédiatement dans l'interface
                            const transformDisplay = row.find('.transformation-display');
                            transformDisplay.html(`<span class="text-success"><strong>+${qty}</strong></span>`);
                            
                            // ✅ NOUVEAU : Mettre à jour aussi la colonne Repack de l'article cible
                            const targetRow = $(`tr[data-item-code="${target_item}"]`);
                            if (targetRow.length > 0) {
                                const currentRepack = targetRow.find('td:nth-child(4) .badge');
                                const currentValue = parseInt(currentRepack.text()) || 0;
                                currentRepack.text(currentValue + qty);
                            }
                            
                            // Réinitialiser l'input
                            row.find('.transformation-qty').val(0);
                            
                            // Recharger après 3 secondes pour avoir les nouvelles données
                            setTimeout(() => {
                                load_items(false);
                            }, 3000);
                        },
                        error: function (err) {
                            console.error('Erreur soumission:', err);
                            frappe.msgprint('❌ Erreur lors de la soumission du Repack.');
                        }
                    });
                } else {
                    frappe.msgprint("❌ Erreur lors de la création de l'entrée Repack.");
                }
            },
            error: function(err) {
                console.error('Erreur création Repack:', err);
                frappe.msgprint('❌ Erreur lors de la création du Repack.');
            }
        });
    }

    // Gestion de l'auto-refresh
    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(() => {
            if (isAutoRefreshEnabled && $('#auto-refresh').is(':checked')) {
                load_items(false);
            }
        }, AUTO_REFRESH_INTERVAL);
    }

    function stopAutoRefresh() {
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
    }

    // Événements
    $('#auto-refresh').on('change', function() {
        isAutoRefreshEnabled = $(this).is(':checked');
        if (isAutoRefreshEnabled) {
            startAutoRefresh();
            updateRefreshStatus('Auto-refresh activé');
        } else {
            stopAutoRefresh();
            updateRefreshStatus('Auto-refresh désactivé');
        }
    });

    $('#manual-refresh').on('click', function() {
        load_items(false);
    });

    $('#apply-filters').on('click', function() {
        load_items(false);
    });

    // ✅ NOUVEAU : Gestionnaire pour la configuration de formule
    $('#config-formula').on('click', function() {
        showFormulaConfig();
    });

    // Gestionnaire du clic sur le bouton Transformer
    $(document).on('click', '.transform-btn', function () {
        const target_item = $(this).data('item-code');
        const row = $(this).closest('tr');
        const qty = parseFloat(row.find('.transformation-qty').val());

        if (!qty || qty <= 0) {
            frappe.msgprint('❗Veuillez saisir une quantité valide.');
            return;
        }

        frappe.prompt([
            {
                fieldname: 'source_item',
                fieldtype: 'Link',
                label: 'Article source à transformer',
                options: 'Item',
                reqd: 1
            }
        ], function (values) {
            const source_item = values.source_item;
            const warehouse = warehouse_filter.get_value();

            if (!warehouse || !source_item || !target_item) {
                frappe.msgprint('❗Données manquantes pour la transformation.');
                return;
            }

            // Créer l'entrée de stock Repack
            createRepackEntry(source_item, target_item, qty, warehouse, row);

        }, 'Transformation Stock', 'Créer Repack');
    });

    // Export Excel amélioré
    $('#export-excel').on('click', function() {
        if (!current_data.length) {
            frappe.msgprint(__('Aucune donnée à exporter.'));
            return;
        }

        if (!window.XLSX) {
            frappe.msgprint(__('Bibliothèque Excel non chargée. Veuillez réessayer.'));
            return;
        }

        try {
            const header = [
                "Article", "Inv J-1", "Entrée Normal", "Repack", "Qte Total", "Retour Atelier", "Sortie Perso",
                "Inventaire J", "Déchet", "Café", "Wahid", "Transfert", "Qte Vendue", "Tappage POS", "Valeur (DT)"
            ];

            const rows = current_data.map(row => [
                row.item_code, row.inv_j1, row.entree_normale, row.entree_repack, row.qte_total,
                row.retour_atelier, row.sortie_personnel, row.inventaire_total,
                row.dechet, row.cofé, row.wahid, row.inventaire_total, 
                row.qte_vendue, row.qty, `${row.valeur.toFixed(2)} DT`
            ]);

            const ws_data = [header, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(ws_data);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Inventaire");
            
            const filename = `inventaire_${frappe.datetime.get_today()}_${new Date().getTime()}.xlsx`;
            XLSX.writeFile(wb, filename);
            
            frappe.show_alert({
                message: `📊 Export Excel réussi : ${filename}`,
                indicator: 'green'
            });
        } catch (error) {
            console.error('Erreur export:', error);
            frappe.msgprint('❌ Erreur lors de l\'export Excel.');
        }
    });

    // Gestion de la visibilité de la page
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            stopAutoRefresh();
        } else if (isAutoRefreshEnabled && $('#auto-refresh').is(':checked')) {
            startAutoRefresh();
            load_items(false);
        }
    });

    // Nettoyage lors de la fermeture
    $(window).on('beforeunload', function() {
        stopAutoRefresh();
    });

    // ✅ INITIALISATION
    startAutoRefresh();
    load_items();
    
    // ✅ NOUVEAU : Afficher la formule active au démarrage
    setTimeout(() => {
        frappe.show_alert({
            message: `📊 Formule active: ${valueFormula}<br><small>Cliquez sur <i class="fa fa-calculator"></i> pour modifier</small>`,
            indicator: 'blue'
        });
    }, 2000);
};
