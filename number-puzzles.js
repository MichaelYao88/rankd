/* Guess-the-number pairs. Female homicide, intentional, per 100k women.
   World Bank / UNODC indicator VC.IHR.PSRC.FE.P5, the same rows as the
   unodc-homicide-female practice dataset. Each pair shows a real anchor
   and asks for a country where the intuitive guess is off: a rich country
   above a poorer one, or a neighbor far from the rate people expect.
   Sensitive, same as the homicide-women daily. Filler-only, so it does not
   take a calendar day. fillerDate is after the AdSense-safe window and after
   the February 2027 filler line. */
window.RANKD_NUMBER = [{
  id: "number-femicide",
  sensitive: true,
  fillerDate: "2027-05-06",
  emoji: "📊",
  headline: "Guess the number",
  stat: "Female homicide rate",
  unit: "per 100k women",
  source: "World Bank / UNODC, intentional homicides, female (VC.IHR.PSRC.FE.P5)",
  sourceUrl: "https://data.worldbank.org/indicator/VC.IHR.PSRC.FE.P5",
  dataset: "unodc-homicide-female",
  art: "scale",
  pairs: [
    { known: { iso3: "IND", name: "India", emoji: "🇮🇳", value: 2.37, year: "2022" }, ask: { iso3: "USA", name: "United States", emoji: "🇺🇸", value: 2.55, year: "2023" }, fact: "The United States is 2.55 per 100k women in 2023, a bit higher than India at 2.37 in 2022." },
    { known: { iso3: "SLV", name: "El Salvador", emoji: "🇸🇻", value: 2.15, year: "2022" }, ask: { iso3: "USA", name: "United States", emoji: "🇺🇸", value: 2.55, year: "2023" }, fact: "The United States is 2.55 in 2023, higher than El Salvador at 2.15 in 2022." },
    { known: { iso3: "CAN", name: "Canada", emoji: "🇨🇦", value: 1.04, year: "2023" }, ask: { iso3: "USA", name: "United States", emoji: "🇺🇸", value: 2.55, year: "2023" }, fact: "The United States is 2.55 in 2023, more than double Canada at 1.04 the same year." },
    { known: { iso3: "CHE", name: "Switzerland", emoji: "🇨🇭", value: 0.45, year: "2022" }, ask: { iso3: "USA", name: "United States", emoji: "🇺🇸", value: 2.55, year: "2023" }, fact: "The United States is 2.55 in 2023, about six times Switzerland at 0.45 in 2022." },
    { known: { iso3: "ISR", name: "Israel", emoji: "🇮🇱", value: 0.48, year: "2022" }, ask: { iso3: "USA", name: "United States", emoji: "🇺🇸", value: 2.55, year: "2023" }, fact: "The United States is 2.55 in 2023, about five times Israel at 0.48 in 2022." },
    { known: { iso3: "USA", name: "United States", emoji: "🇺🇸", value: 2.55, year: "2023" }, ask: { iso3: "RUS", name: "Russia", emoji: "🇷🇺", value: 2.78, year: "2023" }, fact: "Russia is 2.78 in 2023, only a little higher than the United States at 2.55." },
    { known: { iso3: "KOR", name: "South Korea", emoji: "🇰🇷", value: 0.46, year: "2023" }, ask: { iso3: "JPN", name: "Japan", emoji: "🇯🇵", value: 0.23, year: "2023" }, fact: "Japan is 0.23 in 2023, half of South Korea at 0.46, not a match." },
    { known: { iso3: "SGP", name: "Singapore", emoji: "🇸🇬", value: 0.07, year: "2022" }, ask: { iso3: "JPN", name: "Japan", emoji: "🇯🇵", value: 0.23, year: "2023" }, fact: "Japan is 0.23 in 2023, about three times Singapore at 0.07 in 2022." },
    { known: { iso3: "AUS", name: "Australia", emoji: "🇦🇺", value: 0.52, year: "2022" }, ask: { iso3: "NZL", name: "New Zealand", emoji: "🇳🇿", value: 1.12, year: "2022" }, fact: "New Zealand is 1.12 in 2022, more than double Australia at 0.52." },
    { known: { iso3: "NOR", name: "Norway", emoji: "🇳🇴", value: 0.52, year: "2022" }, ask: { iso3: "DEU", name: "Germany", emoji: "🇩🇪", value: 0.87, year: "2023" }, fact: "Germany is 0.87 in 2023, higher than Norway at 0.52 in 2022." },
    { known: { iso3: "SWE", name: "Sweden", emoji: "🇸🇪", value: 0.44, year: "2022" }, ask: { iso3: "FIN", name: "Finland", emoji: "🇫🇮", value: 0.89, year: "2022" }, fact: "Finland is 0.89 in 2022, double Sweden at 0.44." },
    { known: { iso3: "SWE", name: "Sweden", emoji: "🇸🇪", value: 0.44, year: "2022" }, ask: { iso3: "DNK", name: "Denmark", emoji: "🇩🇰", value: 0.78, year: "2022" }, fact: "Denmark is 0.78 in 2022, well above Sweden at 0.44." },
    { known: { iso3: "ITA", name: "Italy", emoji: "🇮🇹", value: 0.41, year: "2022" }, ask: { iso3: "FRA", name: "France", emoji: "🇫🇷", value: 0.69, year: "2022" }, fact: "France is 0.69 in 2022, higher than Italy at 0.41." },
    { known: { iso3: "POL", name: "Poland", emoji: "🇵🇱", value: 0.61, year: "2023" }, ask: { iso3: "DEU", name: "Germany", emoji: "🇩🇪", value: 0.87, year: "2023" }, fact: "Germany is 0.87 in 2023, higher than Poland at 0.61." },
    { known: { iso3: "ARE", name: "United Arab Emirates", emoji: "🇦🇪", value: 0.3, year: "2022" }, ask: { iso3: "QAT", name: "Qatar", emoji: "🇶🇦", value: 0.98, year: "2022" }, fact: "Qatar is 0.98 in 2022, about three times the United Arab Emirates at 0.3." },
    { known: { iso3: "IDN", name: "Indonesia", emoji: "🇮🇩", value: 0.15, year: "2022" }, ask: { iso3: "IND", name: "India", emoji: "🇮🇳", value: 2.37, year: "2022" }, fact: "India is 2.37 in 2022, far above Indonesia at 0.15." },
    { known: { iso3: "SLV", name: "El Salvador", emoji: "🇸🇻", value: 2.15, year: "2022" }, ask: { iso3: "HND", name: "Honduras", emoji: "🇭🇳", value: 5.89, year: "2022" }, fact: "Honduras is 5.89 in 2022, much higher than El Salvador at 2.15." },
    { known: { iso3: "CRI", name: "Costa Rica", emoji: "🇨🇷", value: 1.83, year: "2022" }, ask: { iso3: "GTM", name: "Guatemala", emoji: "🇬🇹", value: 6.08, year: "2022" }, fact: "Guatemala is 6.08 in 2022, about three times Costa Rica at 1.83." },
    { known: { iso3: "BRA", name: "Brazil", emoji: "🇧🇷", value: 3.92, year: "2022" }, ask: { iso3: "MEX", name: "Mexico", emoji: "🇲🇽", value: 5.93, year: "2022" }, fact: "Mexico is 5.93 in 2022, higher than Brazil at 3.92." },
    { known: { iso3: "COL", name: "Colombia", emoji: "🇨🇴", value: 3.73, year: "2022" }, ask: { iso3: "MEX", name: "Mexico", emoji: "🇲🇽", value: 5.93, year: "2022" }, fact: "Mexico is 5.93 in 2022, higher than Colombia at 3.73." },
    { known: { iso3: "BRA", name: "Brazil", emoji: "🇧🇷", value: 3.92, year: "2022" }, ask: { iso3: "GUY", name: "Guyana", emoji: "🇬🇾", value: 7.12, year: "2022" }, fact: "Guyana is 7.12 in 2022, well above Brazil at 3.92." },
    { known: { iso3: "BRA", name: "Brazil", emoji: "🇧🇷", value: 3.92, year: "2022" }, ask: { iso3: "JAM", name: "Jamaica", emoji: "🇯🇲", value: 8.65, year: "2022" }, fact: "Jamaica is 8.65 in 2022, more than double Brazil at 3.92." },
    { known: { iso3: "BRA", name: "Brazil", emoji: "🇧🇷", value: 3.92, year: "2022" }, ask: { iso3: "ZAF", name: "South Africa", emoji: "🇿🇦", value: 12.2, year: "2022" }, fact: "South Africa is 12.2 in 2022, about three times Brazil at 3.92." },
    { known: { iso3: "GRC", name: "Greece", emoji: "🇬🇷", value: 0.84, year: "2022" }, ask: { iso3: "TUR", name: "Turkey", emoji: "🇹🇷", value: 1.07, year: "2022" }, fact: "Turkey is 1.07 in 2022, only a little higher than Greece at 0.84." }
  ]
}];
