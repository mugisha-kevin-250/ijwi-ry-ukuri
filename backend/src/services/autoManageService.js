const PlatformSetting = require('../models/PlatformSetting');
const Article = require('../models/Article');
const GlobalNewsItem = require('../models/GlobalNewsItem');
const Category = require('../models/Category');
const User = require('../models/User');
const crypto = require('crypto');
const globalNewsService = require('./globalNewsService');
const trendService = require('./trendService');
const geminiService = require('./geminiService');
const workflow = require('./articleWorkflow');
const storyMedia = require('./storyMedia');
const publisherArticleService = require('./publisherArticleService');
const aiPhotoService = require('./aiPhotoService');
const generateSlug = require('../utils/generateSlug');

const SETTING_KEY = 'radarAutoManage';
const SOURCE_DESK_URL = 'https://www.radartimes.2bd.net/mugishaimekevin/global-news';
const CATEGORY_KEYWORDS = {
  rwanda:['rwanda','rwandan','kigali','rubavu','musanze','huye','nyagatare','gicumbi'], africa:['africa','african','nigeria','kenya','uganda','tanzania','ethiopia','ghana','south africa','congo'], world:['international','global','worldwide','united nations','cross-border'], 'middle-east':['middle east','gulf','israel','palestine','iran','iraq','saudi arabia','lebanon','syria','yemen','turkey','jordan','uae'], americas:['united states','usa','america','canada','mexico','brazil','argentina','chile','peru','colombia'], europe:['europe','european union','britain','france','germany','spain','italy','ukraine','russia'], 'asia-pacific':['asia','asian','china','japan','india','south korea','australia','new zealand','pacific','indonesia','philippines','thailand'],
  politics:['politics','political','government','parliament','election','president','minister','senate','cabinet','policy'], elections:['election','electoral','vote','voting','ballot','candidate'], diplomacy:['diplomacy','diplomatic','embassy','ambassador','bilateral','summit'],
  business:['business','company','companies','startup','enterprise','ceo','trade','industry'], markets:['stock market','stocks','shares','exchange','bond','nasdaq'], economy:['economy','economic','inflation','gdp','recession','budget'], crypto:['bitcoin','crypto','cryptocurrency','ethereum','blockchain'], energy:['energy','oil','gas','electricity','power grid','solar','renewable'],
  tech:['technology','tech','artificial intelligence','ai model','software','semiconductor','smartphone','robotics'], ai:['artificial intelligence','machine learning','language model','chatbot','generative ai'], gadgets:['smartphone','laptop','gadget','device','tablet','wearable'], cybersecurity:['cybersecurity','cyber attack','hacking','data breach','ransomware'], space:['space','nasa','spacex','satellite','astronaut','rocket'],
  sports:['sports','sport','football','soccer','basketball','tennis','cricket','athletics','rugby','championship','tournament','league','match'], football:['football','soccer','fifa','uefa','premier league','champions league','world cup'], basketball:['basketball','nba','wnba','fiba'], cricket:['cricket','test match','t20','ipl','wicket'], tennis:['tennis','wimbledon','atp tour','wta tour','grand slam'], esports:['esports','e-sports','valorant','league of legends','counter-strike'],
  entertainment:['entertainment','film','movie','cinema','music','concert','actor','celebrity','streaming'], movies:['movie','film','cinema','box office','film festival'], music:['music','singer','album','song','concert','rapper'], gaming:['gaming','video game','playstation','xbox','nintendo'], celebrity:['celebrity','actor','actress','artist','influencer'], streaming:['streaming','netflix','disney+','prime video'],
  health:['health','healthcare','hospital','medical','medicine','disease','doctor','patient'], wellness:['wellness','fitness','nutrition','mental health','exercise'], medicine:['medicine','medical','vaccine','treatment','clinical'], science:['science','scientific','research study','scientist','discovery'], climate:['climate','environment','climate change','global warming','carbon','conservation'],
  education:['education','school','university','college','student','teacher','exam','curriculum'], campus:['campus','university','college','student union','student life'], jobs:['jobs','job','employment','hiring','vacancy','recruitment','career'], opportunities:['scholarship','grant','fellowship','opportunity','internship','funding'], lifestyle:['lifestyle','travel','fashion','food','home','culture'], opinions:['opinion','editorial','commentary','analysis','perspective'], other:['community','local','society','people','culture'], ibindi:['community','local','society','people','culture']
};
const MAX_DRAFTS_PER_PASS = 2;
const MAX_PUBLISH_PER_PASS = 1;
const MAX_CATEGORY_ATTEMPTS_PER_PASS = 6;
const MIN_HEADLINES = 2;
const MIN_DISTINCT_PUBLISHERS = 2;
const MIN_SOURCE_TEXT_CHARS = 500;
const MIN_BODY_CHARS = 1200;
const MIN_PARAGRAPHS = 5;
const UHD_WIDTH = 3840;
const UHD_HEIGHT = 2160;
const DAY_MS = 86400000;

async function getConfig() {
  const setting = await PlatformSetting.findOne({ key: SETTING_KEY }).lean();
  const value = setting?.value && typeof setting.value === 'object' ? setting.value : {};
  return {
    enabled: value.enabled === true,
    ownerId: value.ownerId ? String(value.ownerId) : '',
    lastRunAt: value.lastRunAt || null,
    lastResult: value.lastResult || null,
    lastCategoryCursor: Number(value.lastCategoryCursor) || 0,
    sourceDeskUrl: SOURCE_DESK_URL,
    imagePolicy: 'UHD 4K minimum (3840x2160 landscape or 2160x3840 portrait)',
    researchSources: ['Google Trends', 'RADAR Global News'],
    dailyCategoryCoverage: true,
    mode: 'autonomous-trends-and-global-news-manager',
  };
}

async function setEnabled(enabled, ownerId) {
  const current = await getConfig();
  const value = {
    ...current,
    enabled: enabled === true,
    ownerId: enabled ? String(ownerId || current.ownerId || '') : current.ownerId,
    updatedAt: new Date().toISOString(),
  };
  await PlatformSetting.findOneAndUpdate(
    { key: SETTING_KEY },
    { $set: { key: SETTING_KEY, value, description: 'RADAR autonomous Global News desk research, verified 4K media, safeguarded AI publishing, and action logging.' } },
    { upsert: true, new: true }
  );
  return getConfig();
}

function sourceDomain(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol !== 'https:' || !parsed.hostname) return '';
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch { return ''; }
}

function is4k(photo) {
  const width = Number(photo?.width) || 0;
  const height = Number(photo?.height) || 0;
  return (width >= UHD_WIDTH && height >= UHD_HEIGHT) || (height >= UHD_WIDTH && width >= UHD_HEIGHT);
}

function topicWords(value) {
  const stop = new Set(['about','after','again','against','among','been','before','being','between','could','from','have','into','more','most','other','over','said','says','than','that','their','there','these','they','this','through','under','were','what','when','where','which','while','with','will','would','your','news','update','report']);
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !stop.has(word)));
}

function relatedScore(left, right) {
  const a = topicWords(left);
  const b = topicWords(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function qualityGate(story, evidence) {
  const riskText = String(evidence?.topic || '') + ' ' + String(story?.title || '') + ' ' + String(story?.content || '');
  if (/\b(election|electoral|vote|voting|candidate|president|minister|court|lawsuit|arrest|accused|allegation|murder|killed|death|outbreak|epidemic|pandemic|disease|medicine|medical|healthcare|hospital|vaccine|clinical|war|conflict|attack|terror|rape|child abuse)\b/i.test(riskText)) {
    return 'Held: high-impact political, legal, health, violence or allegation-related reporting requires human editorial review.';
  }
  const sources = (evidence?.headlines || []).filter((item) => sourceDomain(item.url) && item.status === 'extracted' && String(item.text || '').trim().length >= MIN_SOURCE_TEXT_CHARS);
  const domains = new Set(sources.map((item) => sourceDomain(item.url)));
  const paragraphs = Array.isArray(story?.paragraphs) ? story.paragraphs.filter((part) => String(part || '').trim().length >= 45) : String(story?.content || '').split(/\n\s*\n/).filter((part) => part.trim().length >= 45);
  const body = String(story?.content || paragraphs.join('\n\n')).trim();
  if (sources.length < MIN_HEADLINES || domains.size < MIN_DISTINCT_PUBLISHERS) return 'Held: fewer than two distinct HTTPS publishers with full extracted article text were available.';
  if (!String(story?.title || '').trim() || String(story.title).trim().length < 18) return 'Held: headline did not pass the minimum quality check.';
  if (!String(story?.summary || '').trim() || String(story.summary).trim().length < 60) return 'Held: summary was too short or missing.';
  if (body.length < MIN_BODY_CHARS || paragraphs.length < MIN_PARAGRAPHS) return 'Held: article was too short for automatic publication.';
  if (/\b(?:as an ai|i cannot verify|not enough information to write|placeholder text)\b/i.test(body)) return 'Held: generated copy contains an AI limitation or placeholder statement.';
  return '';
}


function normalizeWords(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function categoryScore(category, lead) {
  const slug = canonicalCategorySlug(category);
  const text = ' ' + normalizeWords([lead?.title, lead?.description, lead?.region].join(' ')) + ' ';
  let score = 0;
  for (const term of (CATEGORY_KEYWORDS[slug] || [])) {
    const needle = normalizeWords(term);
    if (needle && text.includes(' ' + needle + ' ')) score += needle.includes(' ') ? 3 : 2;
  }
  const name = normalizeWords(category?.name);
  if (name.length > 2 && text.includes(' ' + name + ' ')) score += 5;
  const region = String(lead?.region || '').toUpperCase();
  if (slug === 'rwanda' && /^(RW|RWA|RWANDA)$/.test(region)) score += 5;
  if (slug === 'africa' && /^(NG|KE|UG|TZ|ZA|GH|ET|SN|CM|CD|RW|RWA)$/.test(region)) score += 2;
  if (slug === 'world' && region && !/^(RW|RWA|RWANDA)$/.test(region)) score += 1;
  return score;
}
function canonicalCategorySlug(category) {
  const slug = normalizeWords(category?.slug || category?.name).replace(/\s+/g, '-');
  const aliases = { sport:'sports', amasport:'sports', amasports:'sports', imikino:'sports', politik:'politics', politiki:'politics', technology:'tech', teknologia:'tech', teknolojiya:'tech', ikoranabuhanga:'tech', ubucuruzi:'business', ubuzima:'health', imirire:'health', ibindi:'other' };
  return aliases[slug] || slug;
}
function uniqueCategoryTargets(categories) {
  const grouped = new Map();
  for (const category of categories) {
    const key = canonicalCategorySlug(category);
    if (!key || key === 'trending') continue;
    const current = grouped.get(key);
    if (!current) grouped.set(key, { category, ids: [category._id] });
    else {
      current.ids.push(category._id);
      if (category.slug === key) current.category = category;
    }
  }
  return [...grouped.values()].sort((a,b) => Number(Boolean(b.category.parent))-Number(Boolean(a.category.parent)) || Number(a.category.order||0)-Number(b.category.order||0));
}
async function collectGoogleTrendLeads() {
  const radar = await trendService.radar({ force: true });
  let processed = 0, saved = 0;
  const seen = new Set();
  for (const region of radar.geos || []) for (const topic of region.topics || []) for (const item of topic.headlines || []) {
    const title = String(item.title || topic.topic || '').trim();
    const link = String(item.url || '').trim();
    const domain = sourceDomain(link);
    if (!title || !domain || seen.has(link)) continue;
    seen.add(link);
    const dedupeKey = crypto.createHash('sha256').update(link.toLowerCase()).digest('hex');
    const result = await GlobalNewsItem.updateOne({ dedupeKey }, {
      $set: { title: title.slice(0,300), sourceName: String(item.source || domain).slice(0,120), sourceUrl: 'https://' + domain, region: String(region.geo || 'WORLD').toUpperCase(), language:'en', fetchedAt:new Date() },
      $setOnInsert: { dedupeKey, link, reviewStatus:'unreviewed', description: 'Google Trends topic: ' + String(topic.topic || '').slice(0,200) + '. Google traffic band: ' + String(topic.trafficLabel || 'not supplied') + '.' }
    }, { upsert:true });
    saved += Number(result.upsertedCount || 0);
    processed += 1;
  }
  return { provider:'google-trends', liveRegions:Number(radar.liveRegions||0), regionsChecked:(radar.geos||[]).length, topics:(radar.geos||[]).reduce((n,g)=>n+(g.topics||[]).length,0), headlinesProcessed:processed, leadsSaved:saved, checkedAt:radar.checkedAt || new Date().toISOString() };
}
async function dailyCategoryPublished(target, dayStart) {
  return Article.countDocuments({ category:{ $in:target.ids }, status:'published', publishedAt:{ $gte:dayStart } });
}

async function verifiedFeaturedImage(title, sources) {
  const candidates = [];
  for (const source of sources) {
    for (const image of (source.images || [])) {
      if (image?.url) candidates.push({
        url: image.url,
        credit: image.credit || source.source || sourceDomain(source.url),
        source: source.source || sourceDomain(source.url),
        pageUrl: source.url,
        why: image.caption || source.title || title,
      });
    }
  }
  // Wikimedia's documented image APIs provide original dimensions, contributor
  // and licence metadata. Search it when publishers do not expose a usable 4K
  // original; never upscale or relabel a smaller image as UHD.
  try {
    const wiki = await aiPhotoService.search(title, { limit: 12 });
    for (const photo of (wiki.photos || [])) candidates.push({
      url: photo.originalUrl || photo.url,
      credit: photo.credit || 'Wikimedia Commons contributor',
      source: photo.source || 'Wikimedia Commons',
      pageUrl: photo.pageUrl || photo.originalUrl || photo.url,
      why: photo.why || title,
      width: photo.width,
      height: photo.height,
    });
  } catch (error) {
    console.warn('[radar-auto] 4K image search unavailable:', error?.message || error);
  }
  const unique = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = String(item.url || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  const checked = await aiPhotoService.verify(unique, { limit: 16 });
  const photo = (checked.photos || []).find(is4k);
  return photo ? {
    url: photo.url,
    credit: photo.credit || photo.source || 'Image contributor',
    source: photo.source || 'Image provider',
    pageUrl: photo.pageUrl || photo.originalUrl || photo.url,
    caption: photo.why || title,
    width: photo.width,
    height: photo.height,
  } : null;
}

async function relatedGlobalLeads(lead) {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const pool = await GlobalNewsItem.find({
    _id: { $ne: lead._id },
    reviewStatus: { $in: ['unreviewed', 'verified'] },
    $or: [{ publishedAt: { $gte: since } }, { publishedAt: null, fetchedAt: { $gte: since } }],
  }).sort({ publishedAt: -1, fetchedAt: -1 }).limit(80).lean();
  return pool
    .filter((item) => relatedScore(lead.title, item.title) >= 0.34)
    .sort((a, b) => relatedScore(lead.title, b.title) - relatedScore(lead.title, a.title))
    .slice(0, 8);
}

/**
 * RADAR manages the newsroom from its own Global News desk. It refreshes the
 * same underlying feed collection shown at the supplied public desk URL,
 * extracts permitted publisher pages, writes original attributed coverage,
 * finds a genuine 4K image and attaches available video. A story cannot go live
 * unless it has a verified UHD image and passes every editorial gate.
 */
async function run() {
  const config = await getConfig();
  if (!config.enabled) return { skipped:true, reason:'Auto Manage is switched off.' };
  if (!geminiService.isConfigured()) return { skipped:true, reason:'Gemini is not configured.' };
  const admin = config.ownerId
    ? await User.findById(config.ownerId).select('_id role isActive').lean()
    : await User.findOne({ role:'ADMIN', isActive:true }).select('_id role isActive').lean();
  if (!admin || admin.role !== 'ADMIN' || admin.isActive === false) return { skipped:true, reason:'The owner account is unavailable; no content was changed.' };

  const [trendResearch, globalRefresh] = await Promise.all([
    collectGoogleTrendLeads().catch(error => ({ provider:'google-trends', error:String(error?.message||error).slice(0,180), liveRegions:0, regionsChecked:0, topics:0, headlinesProcessed:0, leadsSaved:0 })),
    globalNewsService.refresh().catch(error => ({ fetched:0, saved:0, failed:1, error:String(error?.message||error).slice(0,180) }))
  ]);
  const categories = await Category.find({ isActive:true }).sort({ order:1, createdAt:1 }).lean();
  if (!categories.length) return { skipped:true, reason:'No active news categories are configured.' };
  const targets = uniqueCategoryTargets(categories);
  const dayStart = new Date();
  dayStart.setUTCHours(0,0,0,0);
  const since = new Date(Date.now() - 7 * DAY_MS);
  const leads = await GlobalNewsItem.find({
    reviewStatus:{ $in:['unreviewed','verified'] },
    $or:[{ publishedAt:{ $gte:since } },{ publishedAt:null, fetchedAt:{ $gte:since } }]
  }).sort({ publishedAt:-1, fetchedAt:-1 }).limit(300).lean();

  const result = {
    source:'Google Trends + RADAR Global News',
    sourceDeskUrl:SOURCE_DESK_URL,
    trendResearch,
    globalNews:{ fetched:Number(globalRefresh?.fetched||0), saved:Number(globalRefresh?.saved||0), failed:Number(globalRefresh?.failed||0) },
    researched:leads.length,
    categoriesChecked:targets.length,
    categoriesAlreadyCovered:0,
    categoriesMatched:0,
    categoriesAttempted:0,
    drafted:0,published:0,duplicates:0,held:0,mediaAttached:0,verified4kImages:0,videosAttached:0,
    notes:[]
  };
  const used = new Set();
  const categoryStart = targets.length ? (Number(config.lastCategoryCursor || 0) % targets.length) : 0;
  const orderedTargets = [...targets.slice(categoryStart), ...targets.slice(0, categoryStart)];
  for (const target of orderedTargets) {
    if (result.drafted >= MAX_DRAFTS_PER_PASS || result.published >= MAX_PUBLISH_PER_PASS || result.categoriesAttempted >= MAX_CATEGORY_ATTEMPTS_PER_PASS) break;
    result.categoriesAttempted += 1;
    const category = target.category;
    if (await dailyCategoryPublished(target, dayStart)) {
      result.categoriesAlreadyCovered += 1;
      continue;
    }
    const ranked = leads
      .filter(lead => !used.has(String(lead._id)))
      .map(lead => ({ lead, score:categoryScore(category,lead) }))
      .filter(item => item.score > 0)
      .sort((a,b) => b.score-a.score || new Date(b.lead.publishedAt||b.lead.fetchedAt||0)-new Date(a.lead.publishedAt||a.lead.fetchedAt||0));
    let selected = null;
    for (const candidate of ranked) {
      const duplicate = await Article.findOne({
        $or:[{ globalNewsLead:candidate.lead._id },{ 'sources.url':candidate.lead.link }],
        createdAt:{ $gte:new Date(Date.now()-30*DAY_MS) }
      }).select('_id title status').lean();
      if (duplicate) { result.duplicates += 1; continue; }
      selected = candidate.lead;
      break;
    }
    if (!selected) continue;
    result.categoriesMatched += 1;
    used.add(String(selected._id));

    try {
      const related = await relatedGlobalLeads(selected, since);
      const extracted = await Promise.all([selected,...related].slice(0,8).map(async item => {
        const page = await publisherArticleService.fetchPublisherArticle(item.link);
        if (page.status !== 'extracted' || String(page.text||'').trim().length < MIN_SOURCE_TEXT_CHARS) return null;
        return {
          ...page,
          source:item.sourceName || sourceDomain(page.url||item.link),
          feedTitle:item.title,
          feedLeadId:String(item._id),
          images:[...(page.images||[]),...(item.imageUrl?[{url:item.imageUrl,caption:item.imageCaption||item.title,credit:item.imageCredit||item.imageProvider||item.sourceName}]:[])]
        };
      }));
      const fullSources = extracted.filter(Boolean);
      const domains = new Set(fullSources.map(item => sourceDomain(item.url)));
      if (fullSources.length < MIN_HEADLINES || domains.size < MIN_DISTINCT_PUBLISHERS) {
        result.held += 1;
        result.notes.push({ category:category.name, id:String(selected._id), outcome:'held', reason:'Fewer than two related full publisher articles from distinct domains could be safely extracted.' });
        continue;
      }
      const urls = [...new Set(fullSources.map(item=>item.url))];
      const duplicate = await Article.findOne({
        $or:[{globalNewsLead:selected._id},{'sources.url':{$in:urls}}],
        createdAt:{$gte:new Date(Date.now()-30*DAY_MS)}
      }).select('_id title status').lean();
      if (duplicate) {
        result.duplicates += 1;
        result.notes.push({category:category.name,id:String(selected._id),outcome:'duplicate',reason:'A recent article already uses this lead or one of its publisher URLs.'});
        continue;
      }

      const evidence = { topic:selected.title, region:selected.region||'WORLD', headlines:fullSources };
      const story = await geminiService.writeStory({
        topic:selected.title,
        audience:/^(RW|RWA|RWANDA)$/i.test(selected.region||'')?'rwanda':'world',
        region:selected.region||'WORLD',
        evidence:fullSources.slice(0,8),
        angle:'Write an original, accurate RADAR ' + category.name + ' news report and file it specifically under ' + category.name + '. Use only facts supported by extracted publisher articles. Cross-check reporting, attribute disputed claims, identify uncertainty, and never invent quotes, numbers, dates, people, scores or events. Paraphrase reporting; do not copy publisher paragraphs. Produce a strong headline, useful summary and at least five substantive paragraphs. If the evidence does not genuinely fit ' + category.name + ', do not force the category.'
      });
      const title = String(story?.title||'').trim().slice(0,200);
      const failedGate = qualityGate(story,evidence);
      if (!title || !story?.content || !story?.summary) {
        result.held += 1;
        result.notes.push({category:category.name,id:String(selected._id),outcome:'held',reason:'AI returned incomplete article fields.'});
        continue;
      }

      const photo = await verifiedFeaturedImage(title,fullSources);
      if (photo) result.verified4kImages += 1;
      const media = [];
      if (photo) media.push({kind:'image',url:photo.url,source:'',embedUrl:photo.url,caption:String(photo.caption||title).slice(0,240),credit:String(photo.credit||photo.source).slice(0,160)});
      const videoCandidate = fullSources.flatMap(item=>(item.videos||[]).map(video=>({...video,credit:video.credit||item.source,caption:video.caption||item.title||title})))[0];
      let videoFields = {videoUrl:'',videoSource:'',videoEmbedUrl:''};
      if (videoCandidate?.url) {
        const checkedVideo = storyMedia.normalize([{kind:'video',url:videoCandidate.url,caption:videoCandidate.caption,credit:videoCandidate.credit}]);
        if (checkedVideo.ok && checkedVideo.media.length) {
          const video=checkedVideo.media[0];
          media.push(video);
          videoFields={videoUrl:video.url,videoSource:video.source,videoEmbedUrl:video.embedUrl};
          result.videosAttached += 1;
        }
      }
      result.mediaAttached += media.length;

      const article = await Article.create({
        title,
        slug:(generateSlug(title)||'radar-ai-story')+'-'+Date.now()+'-'+(result.drafted+1),
        summary:String(story.summary).slice(0,600),
        metaDescription:String(story.metaDescription||story.summary).slice(0,200),
        content:String(story.content),
        featuredImage:photo?.url||'',
        imageCredit:photo?.credit||'',
        imageSourceUrl:photo?.pageUrl||'',
        imageCaption:photo?String(photo.caption||title).slice(0,240):'',
        media,...videoFields,
        author:admin._id,
        category:category._id,
        tags:(story.tags||[]).slice(0,6),
        language:'en',
        country:selected.region||'WORLD',
        aiGenerated:true,
        globalNewsLead:selected._id,
        status:'pending_review',
        sources:fullSources.slice(0,8).map(item=>({
          title:item.title||item.feedTitle||selected.title,
          organization:item.source||sourceDomain(item.url),
          url:item.url,type:'link',verificationStatus:'pending',addedBy:admin._id,at:new Date()
        })),
        reviewEvents:[{from:'draft',to:'pending_review',by:null,note:'RADAR Auto Manage researched Google Trends and Global News and drafted a '+category.name+' report.',at:new Date()}]
      });
      result.drafted += 1;
      const mediaGate = photo && is4k(photo);
      const publicationGate = failedGate || (!mediaGate?'Held: no genuine 4K featured image (minimum 3840x2160 landscape or 2160x3840 portrait) could be verified. This story cannot be published.':'');
      if (!publicationGate && result.published < MAX_PUBLISH_PER_PASS) {
        const approval = await workflow.moveStory({article,to:'approved',by:null,note:'RADAR Auto Manage passed multi-source, editorial-quality and verified 4K image checks.'});
        if (approval.error) {
          result.held += 1;
          result.notes.push({category:category.name,id:String(article._id),outcome:'held',reason:approval.error});
          continue;
        }
        const publication = await workflow.moveStory({article:approval.article,to:'published',by:null,note:'Automatically published after Google Trends and Global News research, source checks and verified 4K media checks. Category: '+category.name+'.'});
        if (publication.error) {
          result.held += 1;
          result.notes.push({category:category.name,id:String(article._id),outcome:'held',reason:publication.error});
          continue;
        }
        result.published += 1;
        result.notes.push({category:category.name,id:String(article._id),title:article.title,outcome:'published',image:photo.width+'x'+photo.height,video:Boolean(videoFields.videoUrl),sources:fullSources.length});
      } else {
        result.held += 1;
        result.notes.push({category:category.name,id:String(article._id),title:article.title,outcome:'held',reason:publicationGate||'Per-pass publication limit reached.',image:photo?photo.width+'x'+photo.height:'missing',video:Boolean(videoFields.videoUrl)});
      }
    } catch (error) {
      result.held += 1;
      result.notes.push({category:category.name,id:String(selected._id),outcome:'failed',error:String(error?.message||error).slice(0,180)});
    }
  }

  const next = {
    ...config,
    lastRunAt:new Date().toISOString(),
    lastCategoryCursor: targets.length ? (categoryStart + result.categoriesAttempted) % targets.length : 0,
    lastResult:{
      source:result.source,trendResearch:result.trendResearch,globalNews:result.globalNews,
      researched:result.researched,categoriesChecked:result.categoriesChecked,categoriesAttempted:result.categoriesAttempted,categoriesAlreadyCovered:result.categoriesAlreadyCovered,categoriesMatched:result.categoriesMatched,
      drafted:result.drafted,published:result.published,duplicates:result.duplicates,held:result.held,
      mediaAttached:result.mediaAttached,verified4kImages:result.verified4kImages,videosAttached:result.videosAttached,notes:result.notes.slice(0,30)
    }
  };
  await PlatformSetting.findOneAndUpdate({key:SETTING_KEY},{$set:{value:next,updatedAt:new Date()}},{upsert:true,new:true});
  return result;
}

module.exports = { getConfig, setEnabled, run, qualityGate, is4k, relatedScore, categoryScore, collectGoogleTrendLeads };
