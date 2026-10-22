// Static markup for "The story behind Veris". Sprites (canvas[data-sp]) and photo cards are hydrated by story.js.
const storyHtml = `
  <div class="sbar" id="sbar"></div>
  <div class="fl-layer" id="fl" aria-hidden="true"></div>
  <div class="snav">
    <button class="btn btn-o" id="back" type="button">← Back to Veris</button>
    <nav class="acts" id="actnav" aria-label="Story acts">
      <a href="#a-problem" data-go="problem">Problem</a><a href="#a-solution" data-go="solution">Solution</a><a href="#a-impact" data-go="impact">Impact</a><a href="#a-benefits" data-go="benefits">Benefits</a><a href="#a-feasibility" data-go="feasibility">Feasibility</a><a href="#a-viability" data-go="viability">Viability</a><a href="#a-technical" data-go="technical">Technical</a>
    </nav>
    <a class="btn btn-w hideM" data-link="verify" href="https://veris.live/claim">Verify a photo</a>
  </div>

  <!-- 1 INTRO -->
  <section class="act" id="a-intro" style="--h:480">
    <div class="stage">
      <div class="phase" data-r="-1,0.3">
        <div class="wrap two">
          <div>
            <div class="kick"><canvas class="sp" data-sp="camera" data-s="2" aria-hidden="true"></canvas>VERIS · Visual Evidence and Reality Integrity System</div>
            <h1 tabindex="-1" id="storyh">Proof, made at <em>the</em> <span class="shut">shutter.</span></h1>
            <p class="lede">Veris is a small device that clips onto the camera or phone you already own. The moment you press the shutter, it seals proof that the photo is real, so anyone can check it later.</p>
            <div class="pills"><span class="chip o"><canvas class="sp" data-sp="camera" data-s="1" aria-hidden="true"></canvas>Hotshoe for DSLR and mirrorless</span><span class="chip o"><canvas class="sp" data-sp="phone" data-s="1" aria-hidden="true"></canvas>Clip for any phone</span></div>
            <div class="btn-row" style="justify-content:flex-start">
              <a class="btn btn-o" data-link="owner" href="/dashboard">Owner portal →</a>
              <a class="btn btn-w" data-link="verify" href="https://veris.live/claim"><canvas class="sp" data-sp="scan" data-ol="none" data-s="2" aria-hidden="true"></canvas>Verify a photo</a>
            </div>
            <p class="cue">Scroll to follow one journalist's photo ↓</p>
          </div>
          <div class="hideM" style="display:grid;gap:18px;justify-items:center">
            <div style="display:flex;gap:26px;align-items:flex-end"><canvas class="sp" data-sp="dev-hotshoe" data-ol="c" data-s="8" aria-hidden="true"></canvas><canvas class="sp" data-sp="dev-clip" data-ol="c" data-s="8" aria-hidden="true"></canvas></div>
            <div class="chip" style="gap:12px"><canvas class="sp" data-sp="lock" data-s="2" aria-hidden="true"></canvas>SEALED · VERIFIED</div>
          </div>
        </div>
      </div>
      <div class="phase" data-r="0.36">
        <div class="wrap two">
          <div>
            <div class="kick"><canvas class="sp" data-sp="sparkle" data-s="2" aria-hidden="true"></canvas>A Tuesday in a government office</div>
            <h2 class="big">Meera takes <em>the</em> shot.</h2>
            <p class="lede">Meera is a photojournalist. She photographs officials sitting with someone they were never supposed to meet. Nothing is edited. She was standing right there.</p>
            <p class="small">An illustrative story, built from the kinds of cases Veris was designed around.</p>
          </div>
          <div style="position:relative"><div data-photo-card data-cap="UNEXPECTED GUEST" data-exif=""></div></div>
        </div>
      </div>
      <div id="shutterflash" style="position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:5" data-pulse="0.6"></div>
    </div>
  </section>

  <!-- 2 PROBLEM -->
  <section class="act" id="a-problem" style="--h:560">
    <div class="stage">
      <div class="phase">
        <div class="wrap two">
          <div class="post" data-r="-1">
            <div class="who"><span class="av"><canvas class="sp" data-sp="person" data-s="2" aria-hidden="true"></canvas></span><div>Meera<small>@meera.shoots · 2h</small></div></div>
            <div data-photo-card data-cap="UNEXPECTED GUEST" data-stamp="AI?" data-stampclass="bad" data-stampr="0.62" data-plain></div>
            <div class="cmts">
              <div data-r="0.1"><b>@user_8841</b> this is AI lol</div>
              <div data-r="0.2"><b>@lensnerd</b> look at the hand. fake.</div>
              <div data-r="0.3"><b>@truthpls</b> weird reflection in the window</div>
              <div data-r="0.4"><b>@newsdesk_x</b> delete this, it's generated</div>
            </div>
            <div class="rt">↻ 0</div>
          </div>
          <div>
            <div class="kick" data-r="-1"><canvas class="sp" data-sp="cloud" data-s="1" aria-hidden="true"></canvas>The problem</div>
            <h2 class="big" data-r="-1">By lunchtime, the comments say it's AI.</h2>
            <p class="lede hideM" data-r="0.05">Camera details can be rewritten with free tools, and most platforms strip them on upload. "I was there" is one person's word. A detector offers a guess, and a guess does not end an argument. The story stops being about what the photo shows.</p>
            <div class="box o" data-r="0.5" style="margin-top:16px"><div class="t">AI DETECTOR SAYS</div><div class="v">"Likely authentic"</div><div style="font-size:13px">A guess is not proof. Nobody believes it.</div></div>
            <div class="box hideM" data-r="0.6" style="margin-top:12px;font-size:12.5px"><span class="strike">Canon EOS · 1/250 · ISO 800 · 14:02</span><br>metadata: editable · stripped on upload<br><b>metadata can be rewritten in seconds</b></div>
          </div>
        </div>
      </div>
      <div class="phase" data-r="0.74" style="pointer-events:none;align-content:end;place-items:end center;padding-bottom:16px">
        <div class="wrap" style="background:linear-gradient(transparent,var(--k) 30%);padding-top:30px">
          <div class="stats">
            <div class="stat"><b data-count="8" data-suf="M" data-r="0.74">0</b><span>deepfakes shared in 2025 (UK government estimate)</span></div>
            <div class="stat"><b data-count="55.5" data-dec="1" data-suf="%" data-r="0.78">0</b><span>of people correctly spot a deepfake</span></div>
            <div class="stat"><b data-count="40" data-pre="$" data-suf="B" data-r="0.82">0</b><span>projected US gen-AI fraud losses by 2027 (Deloitte)</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3 SOLUTION -->
  <section class="act" id="a-solution" style="--h:500">
    <div class="stage">
      <div class="phase">
        <div class="wrap two">
          <div>
            <div class="kick" data-r="-1"><canvas class="sp" data-sp="lock" data-s="1" aria-hidden="true"></canvas>The solution</div>
            <h2 class="big" data-r="-1">Now give her Veris.</h2>
            <p class="lede" data-r="0.04">Same office, same Tuesday. Veris clips onto her camera's hot shoe or onto her phone. When the shutter fires, it takes its own signed picture, seals the moment inside a chip and files a permanent public record. She shoots exactly as before.</p>
            <div class="devs hideM" data-r="0.1"><figure><canvas class="sp" data-sp="dev-hotshoe" data-ol="c" data-s="6" aria-hidden="true"></canvas>Hotshoe</figure><figure><canvas class="sp" data-sp="dev-clip" data-ol="c" data-s="6" aria-hidden="true"></canvas>Clip</figure></div>
            <div class="timer" data-count="60" data-pre="+" data-suf="s" data-pad="2" data-r="0.15">+00s</div>
            <div class="small">Under 60 seconds, shutter to proof</div>
          </div>
          <div>
            <div class="subh" data-r="0.12">SHUTTER → CLAIM</div>
            <ol class="pipe" style="margin-top:10px">
              <li data-r="0.18"><b>CAPTURE</b><span>Photo + Veris's own image</span></li>
              <li data-r="0.3"><b>ATTEST</b><span>TPM signs. Key stays inside</span></li>
              <li data-r="0.42"><b>PROVE</b><span>Proof without naming her</span></li>
              <li data-r="0.54"><b>STORE</b><span>IPFS + Filecoin, permanent</span></li>
              <li data-r="0.66"><b>CERTIFY</b><span>Certificate in her wallet</span></li>
              <li data-r="0.78"><b>VERIFY</b><span>Anyone checks, no account</span></li>
            </ol>
            <div class="chip o" data-r="0.86" style="margin-top:14px"><canvas class="sp" data-sp="chip" data-s="1" aria-hidden="true"></canvas>VERIS'S OWN SIGNED IMAGE · veris.live/claim/762dc7c6…</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 4 IMPACT -->
  <section class="act" id="a-impact" style="--h:520">
    <div class="stage">
      <div class="phase" data-r="-1,0.7">
        <div class="wrap two">
          <div>
            <div class="kick"><canvas class="sp" data-sp="check" data-s="1" aria-hidden="true"></canvas>The impact</div>
            <h2 class="big">She answers with a link.</h2>
            <p class="lede">Anyone opens veris.live/claim and drops in the photo. If it is the file that left the camera, it matches its record. Change one pixel and it fails. Thanks to the zero-knowledge proof, she never reveals her name or where she stood. In court, the Section 63 certificate starts with the hash already in place.</p>
            <div class="priv" data-r="0.5"><canvas class="sp" data-sp="lock" data-s="2" aria-hidden="true"></canvas>photographer's name and location: never revealed <span class="chip" style="margin-left:4px">example</span></div>
          </div>
          <div class="term" role="img" aria-label="Terminal example: the original photo verifies, an edited copy has no record">
            <div data-r="0.08">$ verify meera_photo.jpg</div>
            <div data-r="0.16" class="dim">hash 9f3a…c1b2 matches claim</div>
            <div data-r="0.22" class="dim">device key registered · proof valid</div>
            <div data-r="0.3" class="ok">✓ VERIFIED · genuine Veris device</div>
            <div data-r="0.4" style="margin-top:12px">$ verify meera_photo_edited.jpg</div>
            <div data-r="0.48" class="dim">hash 4be0…77d1 · one pixel differs</div>
            <div data-r="0.56" class="no">✕ NO RECORD · cannot be vouched for</div>
          </div>
        </div>
      </div>
      <div class="phase" data-r="0.76">
        <div class="wrap" style="max-width:860px;text-align:center;justify-items:center">
          <div class="kick"><canvas class="sp" data-sp="sparkle" data-s="2" aria-hidden="true"></canvas>What her editor asks next</div>
          <h2 class="big">Four questions.</h2>
          <div class="qs" style="width:100%;text-align:left">
            <a href="#a-benefits" data-go="benefits"><b>Who benefits?</b><span>Who else needs this?</span></a>
            <a href="#a-feasibility" data-go="feasibility"><b>Can it be built?</b><span>Can it really be built?</span></a>
            <a href="#a-viability" data-go="viability"><b>Will it pay?</b><span>Will it pay for itself?</span></a>
            <a href="#a-technical" data-go="technical"><b>How does it work?</b><span>How does it work, exactly?</span></a>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 5 BENEFITS (horizontal scrub) -->
  <section class="act" id="a-benefits" style="--h:600">
    <div class="stage hz">
      <div class="hz-track">
        <div class="hz-head">
          <div class="kick"><canvas class="sp" data-sp="heart" data-s="2" aria-hidden="true"></canvas>Benefits</div>
          <h2 class="big">Meera is one of many people whose photos have to be believed.</h2>
          <p class="cue">scroll →</p>
        </div>
        <article class="bcard"><canvas class="sp" data-sp="camera" data-s="4" aria-hidden="true"></canvas><h3>Journalists and fact-checkers</h3><div class="big">64.4% of BOOM's May 2025 fact-checks<small>were old or unrelated footage passed off as new.</small></div><p class="prob">Verification is slow and tiring.</p><p class="with"><b>WITH VERIS</b>Every photo carries a record of when it was really taken. A claim link answers in seconds, without revealing who she is or where she stood.</p></article>
        <article class="bcard"><canvas class="sp" data-sp="book" data-s="4" aria-hidden="true"></canvas><h3>Courts, police and forensics</h3><div class="big">Section 63<small>Bharatiya Sakshya Adhiniyam, 2023</small></div><p class="prob">Electronic records need a certificate with the file's hash, usually calculated long after the photo was taken.</p><p class="with"><b>WITH VERIS</b>The SHA-256 hash is made at capture, anchored with the device signature and time. The hashes either match or they do not.</p></article>
        <article class="bcard"><canvas class="sp" data-sp="lock" data-s="4" aria-hidden="true"></canvas><h3>Insurers, banks and platforms</h3><div class="big">₹8,000–10,000 cr<small>health-insurance fraud and leakage a year (BCG, Medi Assist)</small></div><p class="prob">Edited photos of damaged goods and property are already used to push refunds and false claims.</p><p class="with"><b>WITH VERIS</b>Field photos are signed when taken, so fewer manual reviews, faster decisions and fewer disputes.</p></article>
        <article class="bcard"><canvas class="sp" data-sp="check" data-s="4" aria-hidden="true"></canvas><h3>Photographers</h3><div class="big">Own it<small>ERC-1155 certificate, in your wallet</small></div><p class="prob">Metadata gets stripped and files get copied without credit.</p><p class="with"><b>WITH VERIS</b>The certificate stays tied to the photographer's record. Proof of authorship when a photo is reused, licensed or disputed, even for freelancers no editor has met.</p></article>
        <article class="bcard"><canvas class="sp" data-sp="heart" data-s="4" aria-hidden="true"></canvas><h3>Everyone else</h3><div class="big">Check, don't guess<small>replace judging by eye with a record</small></div><p class="with"><b>WITH VERIS</b>Veris answers with a lookup anyone can repeat. It runs on hashes and content IDs, and clips onto equipment people already own, so nothing gets thrown away.</p></article>
        <div class="sdg"><div>SDG 16 · justice and institutions</div><div>SDG 9 · ₹0.5–3 per certificate</div><div>SDG 13 · small footprint</div></div>
      </div>
    </div>
  </section>

  <!-- 6 FEASIBILITY + VIABILITY -->
  <section class="act" id="a-feasibility">
    <div class="stage sb">
      <div class="sb-inner"><div class="sb-in">
        <div><div class="kick"><canvas class="sp" data-sp="chip" data-s="1" aria-hidden="true"></canvas>BUILT · Feasibility</div>
        <h2 class="big">Can it be built? It already is.</h2>
        <p class="lede">Veris runs on off-the-shelf parts and networks that already exist. The standalone prototype cost about ₹10,000 and runs the full pipeline today.</p></div>
        <div class="subh rv">Build status</div>
        <div class="g2">
          <div class="cardx o rv"><h3>Standalone unit</h3><p>Raspberry Pi 4 + camera + TPM. Shutter to minted claim in under 60 seconds, on Ethereum Sepolia.</p><div class="track" data-stage="1"><i>Concept</i><i>Prototype</i><i>Pilot</i><i>Product</i></div></div>
          <div class="cardx rv"><h3>VERIS Clip</h3><p>Spring-loaded, powered by the phone's USB-C, paired by Bluetooth. Captures a second verified image beside the phone's own.</p><div class="track" data-stage="0"><i>Concept</i><i>Prototype</i><i>Pilot</i><i>Product</i></div></div>
          <div class="cardx rv"><h3>VERIS Hotshoe</h3><p>Runs on a Raspberry Pi Zero, triggered from the hot shoe's centre pin. Carrier PCB designed and made as a two-layer board.</p><div class="track" data-stage="1"><i>Concept</i><i>Prototype</i><i>Pilot</i><i>Product</i></div></div>
          <div class="cardx rv"><h3>Custom board</h3><p>Rockchip RK3566 module, Infineon OPTIGA TPM and Sony IMX219 sensor, to make both units smaller and cheaper.</p><div class="track" data-stage="0"><i>Concept</i><i>Prototype</i><i>Pilot</i><i>Product</i></div></div>
        </div>
        <div class="subh rv">Risks we planned for</div>
        <div class="g2">
          <div class="cardx rv"><h3>Phones and cameras vary</h3><p>Standard interfaces only: the hot shoe, a universal spring clip, USB-C.</p></div>
          <div class="cardx rv"><h3>No signal in the field</h3><p>Offline-first. It signs locally, then syncs. A late upload does not weaken the proof.</p></div>
          <div class="cardx rv"><h3>A device is lost or stolen</h3><p>Keys live in secure hardware. A revocation registry is planned.</p></div>
          <div class="cardx rv"><h3>Will courts accept it?</h3><p>Pilots with legal experts and institutions, aligned with Section 63.</p></div>
        </div>
        <div class="subh rv">Proven parts, new combination</div>
        <div class="g3">
          <div class="cardx rv"><h3>TPM 2.0</h3><p>Already in millions of laptops and servers. Holds the signing key.</p></div>
          <div class="cardx rv"><h3>Ethereum</h3><p>Public ledger. Verifier and certificate contracts.</p></div>
          <div class="cardx rv"><h3>IPFS + Filecoin</h3><p>Content-addressed, long-term storage.</p></div>
          <div class="cardx rv"><h3>RISC Zero</h3><p>Zero-knowledge proofs checked on-chain.</p></div>
          <div class="cardx rv"><h3>Hot shoe mount</h3><p>Standard on DSLR and mirrorless bodies.</p></div>
          <div class="cardx rv"><h3>USB-C</h3><p>Powers the Clip from the phone itself.</p></div>
        </div>
        <p class="lede rv" style="max-width:none">Live today: claim pages at veris.live/claim. Adoption goes pilot, then institutions, then scale.</p>
      </div></div>
    </div>
  </section>

  <section class="act" id="a-viability">
    <div class="stage sb">
      <div class="sb-inner"><div class="sb-in">
        <div><div class="kick"><canvas class="sp" data-sp="heart" data-s="1" aria-hidden="true"></canvas>PAYS · Viability</div>
        <h2 class="big">Will it pay for itself? Three ways, starting small.</h2>
        <p class="lede">Newsrooms, courts and police, insurers, forensic labs and camera makers all need a photo they can defend. Veris charges once for the device and a few rupees per photo.</p></div>
        <div class="g3">
          <div class="cardx o rv"><div class="big">₹2k–8k</div><h3>The device</h3><p>Estimated build cost per unit: Clip ₹2–4k, Hotshoe ₹3–5k, Standalone ₹5–8k. One-time sale that gets Veris into the workflow.</p></div>
          <div class="cardx o rv"><div class="big">₹0.5–3</div><h3>Every photo</h3><p>A small minting and verification fee, kept low on purpose so freelancers can seal every shot, not only the big ones.</p></div>
          <div class="cardx o rv"><div class="big">API + SaaS</div><h3>Institutions</h3><p>Verification at scale for newsrooms, insurers and platforms, plus enterprise licences and camera-maker integrations.</p></div>
        </div>
        <div class="g3">
          <div class="cardx rv"><div class="subh" style="margin:0">First</div><h3>Journalists and conflict photographers</h3><p>The highest cost of disbelief, fast feedback from daily publishing, and a privacy need the zero-knowledge proof meets.</p></div>
          <div class="cardx rv"><div class="subh" style="margin:0">Then</div><h3>Forensics and courts</h3><p>Capture-time hash and signature for case files, mapped to Section 63.</p></div>
          <div class="cardx rv"><div class="subh" style="margin:0">Then</div><h3>Insurance and platforms</h3><p>Proof of time and place for every claim photo.</p></div>
        </div>
        <div class="tblw rv"><table class="tbl"><thead><tr><th>Capability</th><th>Veris</th><th>C2PA cameras</th><th>AI detectors</th></tr></thead><tbody>
          <tr><td>Signs in hardware at capture</td><td class="v">Yes, TPM 2.0</td><td>Yes, on supported bodies</td><td>No</td></tr>
          <tr><td>Works with the phone or camera you own</td><td class="v">Yes, Clip and Hotshoe</td><td>No, needs a new body or firmware</td><td>Yes</td></tr>
          <tr><td>Record survives stripped metadata</td><td class="v">Yes, on-chain and IPFS</td><td>Partly</td><td>n/a</td></tr>
          <tr><td>Hides who took it and where</td><td class="v">Yes, zero-knowledge</td><td>No</td><td>n/a</td></tr>
          <tr><td>Public, permanent record</td><td class="v">Yes</td><td>No</td><td>No</td></tr>
          <tr><td>Independent second witness</td><td class="v">Yes, dual capture</td><td>No</td><td>No</td></tr>
          <tr><td>Entry price</td><td class="v">₹2k–8k per unit (build cost)</td><td>From US$9,195 (Leica M11-P)</td><td>Software</td></tr>
        </tbody></table></div>
        <div class="g2">
          <div class="cardx rv"><div class="big">900% a year</div><p>growth in synthetic media, which may reach 90% of online content by 2027. Detection keeps falling behind.</p></div>
          <div class="cardx rv"><div class="big">$71.5M → $1.12B</div><p>India's deepfake-AI market, 2025 to 2033, 48.2% a year (IMARC). The need for proof grows with it.</p></div>
        </div>
      </div></div>
    </div>
  </section>

  <!-- 7 TECHNICAL -->
  <section class="act" id="a-technical">
    <div class="stage sb">
      <div class="sb-inner"><div class="sb-in">
        <div><div class="kick"><canvas class="sp" data-sp="sparkle" data-s="2" aria-hidden="true"></canvas>PROOF · Technical</div>
        <h2 class="big">How it works, exactly.</h2>
        <p class="lede">For engineers, newsroom IT and anyone who wants to check our work. Three stages, six steps, one root of trust: the chip.</p></div>
        <div class="g3">
          <div class="stg rv"><div class="subh" style="margin:0">Stage 1</div><h3 style="font:700 20px var(--f-px)">Physical capture</h3><p class="small" style="margin:0">The photo is secured at the source.</p>
            <p style="font-size:13px"><span class="num">1</span><b>Capture</b> Take the photo as usual with the Clip or Hotshoe attached. Veris takes its own image at the same instant.</p>
            <p style="font-size:13px"><span class="num">2</span><b>Attest in hardware</b> A TPM 2.0 chip signs the image digest. Its key was fused in at manufacture and never leaves the chip.</p></div>
          <div class="stg rv"><div class="subh" style="margin:0">Stage 2</div><h3 style="font:700 20px var(--f-px)">Cryptographic proof</h3><p class="small" style="margin:0">Automatic, private and tamper-evident.</p>
            <p style="font-size:13px"><span class="num">3</span><b>Prove</b> A zero-knowledge proof (vlayer) shows the signature is genuine without exposing identity, GPS or device serial.</p>
            <p style="font-size:13px"><span class="num">4</span><b>Store</b> Image, metadata and proof go to IPFS and Filecoin, addressed by their own hash.</p>
            <p style="font-size:13px"><span class="num">5</span><b>Certify</b> A RISC Zero verifier checks the proof on-chain; an ERC-1155 token is minted to the photographer's wallet.</p></div>
          <div class="stg rv"><div class="subh" style="margin:0">Stage 3</div><h3 style="font:700 20px var(--f-px)">Public verification</h3><p class="small" style="margin:0">Anyone, anywhere, no account.</p>
            <p style="font-size:13px"><span class="num">6</span><b>Verify</b> Upload a photo at veris.live/claim. Match plus valid proof gives <b style="color:var(--o)">VERIFIED</b>. No match gives <b style="color:var(--ol)">NO RECORD</b>, which means Veris cannot vouch for it, not that it is fake.</p></div>
        </div>
        <div class="subh rv">The proof, in four lines</div>
        <div class="code rv">
          <div><span class="e">h = H(I)</span><span class="d">Hash the image. Change one pixel and the hash changes completely.</span></div>
          <div><span class="e">σ = Sign(sk<sub>D</sub>, h ‖ H(μ))</span><span class="d">The chip signs the hash and capture metadata. Only a real device can.</span></div>
          <div><span class="e">π ← Prove{(pk<sub>D</sub>, σ, μ): Verify = 1 ∧ pk<sub>D</sub> ∈ R}</span><span class="d">Prove a registered device signed it, revealing nothing else.</span></div>
          <div><span class="e">Accept(I′) ⇔ H(I′) = h ∧ VerifyZK(π) = 1</span><span class="d" style="margin:0">A checker needs only the photo and the public record.</span></div>
        </div>
        <div class="subh rv">Stack</div>
        <div class="tblw rv"><table class="tbl"><tbody>
          <tr><td>Capture</td><td>Raspberry Pi 4 and camera module (standalone); Pi Zero (Hotshoe)</td></tr>
          <tr><td>Signing</td><td>Hardware Identity Module, TPM 2.0</td></tr>
          <tr><td>Storage</td><td>Filecoin via Synapse SDK, IPFS CIDs</td></tr>
          <tr><td>Proof</td><td>vlayer; VerisVerifier.sol on RISC Zero</td></tr>
          <tr><td>Ownership</td><td>VerisERC1155.sol, claimed by QR code</td></tr>
          <tr><td>Network</td><td>Ethereum Sepolia (testnet)</td></tr>
          <tr><td>App</td><td>VERIS app over Bluetooth for the Clip</td></tr>
        </tbody></table></div>
        <div class="g2">
          <div class="cardx o rv"><h3>Dual capture</h3><p>A phone's or DSLR's firmware is outside our control. So Veris takes a second, independently signed image at the same instant. The Clip is triggered by the app over Bluetooth, the Hotshoe by the camera's X-sync centre pin. A scene-matching model and a forensic check confirm both frames show the same scene. The main photo inherits the proof only if they match.</p></div>
          <div class="code rv" style="font-size:12px"><div class="subh" style="margin:0 0 8px">A claim record, abridged</div>
            <div>claim_id 762dc7c6-08c0-45ee-8400-453ea9dec149</div>
            <div>status <span class="e">claimed · token 148</span></div>
            <div>image_hash SHA-256 · image CID · metadata CID</div>
            <div>device device_id · camera_id · device_address</div>
            <div>companion_capture SSIM · consistency score · AI hint</div>
            <div>ai_assessment informative only, not part of the proof</div></div>
        </div>
        <div class="subh rv">Threat model</div>
        <div class="tblw rv"><table class="tbl"><thead><tr><th>Attack</th><th>What stops it</th><th>What remains</th></tr></thead><tbody>
          <tr><td>Edit pixels after capture</td><td>Digest on-chain; any change fails the match</td><td>Edits become new, unverified images</td></tr>
          <tr><td>Forge a signature</td><td>Key generated and held inside the TPM</td><td>Depends on the chip's tamper resistance</td></tr>
          <tr><td>Compromise Veris servers</td><td>Servers cannot forge a signature or proof; verification is on-chain</td><td>Availability, not authenticity</td></tr>
          <tr><td>Link a photo to its photographer</td><td>Zero-knowledge proof hides key, signature and metadata</td><td>Prototype claim pages still show GPS and device ID; opt-in is planned</td></tr>
        </tbody></table></div>
        <div class="subh rv">Open problems, stated plainly</div>
        <div class="g4">
          <div class="cardx rv"><h3>The analog hole</h3><p>Photographing a screen that shows a fake is open for every capture-side system. Dual capture mitigates it, not closes it.</p></div>
          <div class="cardx rv"><h3>Testnet only</h3><p>Everything runs on Ethereum Sepolia. Mainnet or layer-2 cost and finality are still to be measured.</p></div>
          <div class="cardx rv"><h3>Key provisioning</h3><p>The factory process, the device registry and the revocation path are not yet specified.</p></div>
          <div class="cardx rv"><h3>Legal acceptance</h3><p>No court has yet ruled on a Veris claim under Section 63.</p></div>
        </div>
        <div class="endcap rv">
          <canvas class="sp" data-sp="heart" data-s="5" aria-hidden="true"></canvas>
          <p class="kick" style="margin:0">Authenticity as a hardware guarantee, not a software promise</p>
          <h3>A photo that carries its own proof.</h3>
          <div class="btn-row"><a class="btn btn-o" data-link="owner" href="/dashboard">Owner portal →</a><a class="btn btn-w" data-link="verify" href="https://veris.live/claim"><canvas class="sp" data-sp="scan" data-ol="none" data-s="2" aria-hidden="true"></canvas>Verify a photo</a></div>
          <p class="small">VERIS · Visual Evidence and Reality Integrity System<br>Prototype on Ethereum Sepolia testnet</p>
        </div>
      </div></div>
    </div>
  </section>
`

export default storyHtml
