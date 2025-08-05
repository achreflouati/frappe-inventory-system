import frappe

@frappe.whitelist()
def get_factures(date_debut, date_fin, point_vente=None):
    filters = [
        ["posting_date", ">=", date_debut],
        ["posting_date", "<=", date_fin]
    ]
    if point_vente:
        filters.append(["customer", "=", point_vente])

    invoices = frappe.get_all(
        "Facture NE",  # <-- Mets le nom de ton app ici
        filters=filters,
        fields=["name", "customer", "posting_date", "grand_total"]
    )
    return invoices