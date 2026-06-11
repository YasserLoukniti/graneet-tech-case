/**
 * XML CII (UN/CEFACT Cross Industry Invoice) : la moitié « machine » d'un
 * Factur-X — l'autre moitié étant le PDF rendu depuis le template HTML.
 *
 * Point d'architecture démontré ici : ce module consomme le **même**
 * `computeTotals` que le template HTML. Les deux représentations embarquées
 * dans un Factur-X ne peuvent donc pas diverger — la norme EN 16931 vérifie
 * la cohérence interne des totaux (ex. TTC = HT + TVA).
 *
 * Squelette volontairement minimal : une implémentation complète couvre tous
 * les champs BT-* de la norme (SIREN, adresses, conditions de paiement...)
 * et se valide contre les XSD + Schematron officiels (cf. veraPDF côté PDF).
 */

import { escapeXml } from "../escape.ts";
import { computeTotals, type VatBreakdownEntry } from "../totals.ts";
import type { Invoice, InvoiceLine } from "../types.ts";

/** Centimes → décimal XML "1234.56", sans flottant (signe géré pour les avoirs). */
export function xmlAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Points de base → pourcentage XML : 2000 bps → "20.00" (même échelle que les centimes). */
function xmlRate(bps: number): string {
  return xmlAmount(bps);
}

/** "2026-06-01" → "20260601" (format CII "102"). */
function xmlDate(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

export function renderInvoiceCiiXml(invoice: Invoice): string {
  const totals = computeTotals(invoice);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${escapeXml(invoice.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${xmlDate(invoice.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
${invoice.lines.map((line, i) => lineItem(line, i, totals.lineTotalsCents[i])).join("\n")}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${escapeXml(invoice.seller.name)}</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${escapeXml(invoice.buyer.name)}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
${totals.vatBreakdown.map(tradeTax).join("\n")}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${xmlAmount(totals.totalExclVatCents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${xmlAmount(totals.totalExclVatCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${xmlAmount(totals.totalVatCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${xmlAmount(totals.totalInclVatCents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${xmlAmount(totals.totalInclVatCents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/* ------------------------------- Sections ------------------------------- */

function lineItem(line: InvoiceLine, index: number, totalCents: number): string {
  return `    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${index + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${escapeXml(line.label)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeSettlement>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${xmlAmount(totalCents)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
}

function tradeTax(entry: VatBreakdownEntry): string {
  return `      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${xmlAmount(entry.vatCents)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${xmlAmount(entry.baseCents)}</ram:BasisAmount>
        <ram:RateApplicablePercent>${xmlRate(entry.rateBps)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`;
}
