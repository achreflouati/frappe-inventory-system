# 📦 Frappe Inventory System

Un système d'inventaire avancé pour Frappe/ERPNext avec intégration complète des Stock Entries et pricing en temps réel.

## 🚀 Fonctionnalités

### 📊 Gestion d'Inventaire Complète
- **Récupération automatique des Stock Entries** avec séparation Normal/Repack
- **Intégration des Price Lists ERPNext** avec prix réels en Dinars Tunisiens (DT)
- **Suivi des transformations** avec indicateurs visuels pour les operations Repack
- **Interface plein écran** optimisée pour la productivité
- **Auto-refresh** toutes les 30 secondes avec mise en cache intelligente

### 🔄 Transformations Avancées
- **Création automatique de Stock Entries Repack** via l'interface
- **Traçabilité des transformations** avec affichage source → cible
- **Indicateurs visuels** pour les articles transformés et sources
- **Validation en temps réel** des quantités et stocks

### 💰 Pricing Intelligent
- **Prix réels depuis ERPNext Price Lists** au lieu de données simulées
- **Chargement optimisé en batch** pour de meilleures performances
- **Système de fallback** pour les articles sans prix
- **Formules personnalisables** pour calculs de valeur

### 📈 Interface Utilisateur
- **Design responsive** avec support mobile
- **Filtrage avancé** par article, entrepôt et liste de prix
- **Export Excel** avec données de prix et transformations
- **Configuration de formules** via interface graphique
- **Chargement progressif** pour de grandes listes

## 🛠️ Installation

### Prérequis
- Frappe Framework v13+
- ERPNext (optionnel mais recommandé)
- Python 3.7+

### Installation via Git

```bash
# Dans votre bench Frappe
cd frappe-bench/apps
git clone https://github.com/achreflouati/frappe-inventory-system.git invontory
cd ..
bench --site [nom-du-site] install-app invontory
bench --site [nom-du-site] migrate
```

## 📋 Configuration

### 1. Configurer les DocTypes

L'application crée automatiquement les DocTypes suivants :
- **Inventaire Ne** : Gestion des inventaires principaux
- **Inventaire Item** : Articles d'inventaire avec quantités et transformations

### 2. Configurer les Price Lists

Assurez-vous d'avoir au moins une Price List configurée dans ERPNext :
```
Selling > Price List > Standard Selling
```

## 🎯 Utilisation

### Interface Principale

Accédez à l'interface via :
```
[votre-site]/app/inv
```

### Fonctionnalités Clés

1. **Sélectionner un entrepôt** dans le filtre
2. **Choisir une Price List** pour les prix réels
3. **Configurer la formule** de calcul via le bouton calculatrice
4. **Créer des transformations** via les boutons d'échange dans le tableau
5. **Exporter les données** vers Excel avec toutes les informations

### Formules Personnalisées

Variables disponibles :
- `qte_total` : Quantité totale
- `dechet` : Quantité de déchet
- `retour_atelier` : Retour atelier
- `wahid` : Quantité Wahid
- `sortie_personnel` : Sortie personnel
- `unit_price` : Prix unitaire (DT)
- `entree_normale` : Entrée normale
- `entree_repack` : Entrée Repack
- `inv_j1` : Inventaire J-1

**Exemple de formule :**
```javascript
(qte_total - dechet - retour_atelier - wahid - sortie_personnel) * unit_price
```

## 👨‍💻 Auteur

**Achref Louati**
- GitHub: [@achreflouati](https://github.com/achreflouati)

## 📄 License

MIT