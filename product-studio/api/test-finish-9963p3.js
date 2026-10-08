import { buildProductFromSource } from '../lib/product-builder.js';

export default async function handler(req,res){
  try{
    const brief=`
Create a Watermelon Experiences draft in original English copy for this EXISTING Watermelon product. Preserve only supported facts and do not invent extras.

Product: Dolphin Watching Experience and Trawler Full Day Tour with Lunch
Location: Setúbal, Portugal
Source product code: Viator 9963P3
Private experience.
Official public source says duration 4 to 6 hours.
Meeting point: Setúbal Harbor Fishing Dock, Av. José Mourinho 14, 2900-633 Setúbal, Portugal.
Tour returns to the same meeting point.
Official itinerary references Arrábida Natural Park, Portinho da Arrábida (30 minutes), passes Praia dos Galapos and Tróia.
Included: lunch, skipper/guide, local guide.
Excluded: food and drinks unless specified, gratuities.
Languages: Portuguese, English, French and Spanish.
Minimum 8 people per booking; maximum 12 people per booking.
Children must be accompanied by an adult.
Minimum drinking age 18.
Dietary requirements must be advised at booking; vegetarian option available on request.
Not wheelchair accessible. Public transportation nearby. Not recommended for pregnant travelers.
Good weather required. Minimum traveler requirement applies.
Cancellation: full refund if cancelled at least 24 hours before start time; no refund and no changes within 24 hours. Cutoff is based on local time.
Option TG1: All inclusive. Spend a wonderful day at sea and lunch onboard. Confirmed start time in current Viator catalogue: 10:00.
Option TG2: With Transfer - All inclusive. Same sea experience and lunch onboard plus transfer from Lisbon. Source says optional transfer duration is approximately 40 minutes, exact duration depending on traffic. Do not invent a fixed departure time for the transfer option.
Use a premium-but-competitive private group positioning.
`;
    const out=await buildProductFromSource({mode:'text',brief});
    return res.status(200).json(out);
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e?.message||String(e)});
  }
}
