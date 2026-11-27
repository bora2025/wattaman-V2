# Face recognition models: decision and plan

Started: 2026-11-20 · Status: **decided: open-source models** (2026-11-20) · Related: `smart-attendance-plugin-plan.md` (§6.3)

## 1. Decision

Smart Attendance uses published open-source face models. We do not train our own model now; §5–§9 stay as the plan if that changes.

| Part | Model | Licence of the files we ship |
|---|---|---|
| Face detection, 478 landmarks, blink scores (alignment and liveness) | MediaPipe Face Landmarker (Google), `face_landmarker.task` with `@mediapipe/tasks-vision` 1.2.3 | Apache-2.0 (library). The model card's terms are still to be read and recorded. |
| Recognition (aligned face → 128 numbers) | dlib's ResNet face recognition model (`dlib_face_recognition_resnet_model_v1`), as converted to TensorFlow.js in `@vladmandic/face-api` 1.7.15 | Weights: released into the public domain by their author, Davis King (dlib-models, CC0-1.0). Package and conversion: MIT. |

The school page serves the notices next to the models, in `/face-models/LICENSES.txt`.

## 2. What the licences do and do not cover

- **They cover the files.** We may copy, ship and use them in a paid product, with the notices kept.
- **They do not cover the training photos.** The dlib model was trained on about 3 million faces from FaceScrub, the VGG face dataset and images scraped from the internet. Those collections were made for research. The model's licence says nothing about them, and nobody can grant rights over them now. Almost every published face model has the same history, including SFace below. This is the risk we accept by choosing open source; the lawyer should know about it.
- **They do not cover the school's own duty.** Using any face model for students still needs the guardian's consent, the consent record, and deletion when it is withdrawn. Smart Attendance already enforces these.

## 3. Alternatives checked (2026-11-20)

| Model | Licence | Notes |
|---|---|---|
| **dlib ResNet** (chosen) | CC0 weights, MIT conversion | LFW about 99.4 %. 6.4 MB. Already built in; no extra runtime. |
| OpenCV Zoo **SFace** (MobileFaceNet) | Apache-2.0 per the opencv_zoo folder | Reported accuracy about 99.4 %, the same class as dlib. int8 file 9.4 MB, but it needs the ONNX runtime in the page (about 10 MB more WebAssembly) and 5-point alignment. Training data not named (the original SFace work used research face datasets). **Fallback** if dlib's model disappoints in the pilot. |
| InsightFace model zoo (buffalo, antelope) | "non-commercial research purposes only" | Most accurate (LFW 99.8 %), but **not allowed** in a paid product. |
| dlib 68-point landmarks | non-commercial | Not allowed; already removed. |

## 4. How it fits

- The camera, liveness and the face model run in the school page; plugin screens receive only vectors.
- Matching runs in the plugin (distance: accept 0.5, review 0.58, margin 0.06).
- Every enrolment stores its model version (now `mediapipe-face-landmarker-1/face-recognition-128-v2`). Vectors of different versions are never compared, so switching to SFace, or to our own model later, only needs re-enrolment ("🔄 Enrol again"). That path is built in Smart Attendance 0.2.1.

**Before paying schools use faces:**
1. **A pilot measurement.** Run one school's real faces through it for 4 weeks, next to QR/NFC on the same days. Count wrong-person matches, refused students and review cases. The sample-photo test so far is not a measure of accuracy. Tune the thresholds from it.
2. **A legal check.** The lawyer reviews the consent form and §2.
3. **The model card.** Record MediaPipe's model card terms.

---

## 5. If we later train our own model (on hold)

The rest of this document is the plan kept for later: for example, if the pilot shows poor accuracy on Cambodian children, or a customer requires known training data.

**What we would build.** A face recognition (embedding) network: an aligned 112×112 or 150×150 face in, a vector of 128–512 numbers out.
- **Architecture:** MobileFaceNet (about 1 M parameters, 4 MB; fast in a browser on cheap tablets), or ResNet-50 for a server or terminal version.
- **Training method:** ArcFace (additive angular margin loss).
- **Input alignment:** the same MediaPipe landmarks the school page uses now.
- **Output:** TensorFlow.js or ONNX, served from `/face-models`, with a new model version such as `wattanam-face-1`.

## 6. Training data

**Rule:** only images whose terms explicitly allow training a commercial model. Every image must have a recorded source and terms.

| Source | Notes |
|---|---|
| **Paid volunteers with signed consent** (recommended core) | Adults, 20–50 photos each across days, lighting, angles, glasses and headscarves. The consent form covers training a commercial face recognition model, storage and deletion. |
| **Licensed commercial datasets** | Compare price, size, consent records and the population's diversity. |
| **Synthetic faces** | Check each dataset's licence; useful to add volume, never alone. |
| **Not used** | Students' enrolment data, web-scraped datasets, any "research only" dataset. Children's faces are never used for training unless a separate, explicit consent and legal review allow it. |

| Purpose | People | Photos each |
|---|---|---|
| First usable model | 2,000–5,000 | 20+ |
| Good model | 10,000+ | 20+ |
| Evaluation set (kept apart) | 300+, including children with guardian consent for **testing only** | |

## 7. Steps and cost

| Step | What | Time |
|---|---|---|
| 1 | Legal check of the consent form and data terms | 2–3 weeks |
| 2 | Collection app and consented photo sessions | 2 weeks to build; 1–3 months collecting |
| 3 | Cleaning and alignment | 1–2 weeks |
| 4 | Training on rented GPUs | 3–6 weeks |
| 5 | Evaluation and bias checks by age, sex and skin tone | 1–2 weeks |
| 6 | Conversion and a new model version | 1 week |
| 7 | Pilot with re-enrolment | 4 weeks |

**Rough cost:** an ML engineer for 3–4 months; volunteer payments (for example USD 3–5 per person per session); GPU rental of a few hundred to a couple of thousand USD; the legal review.

## 8. When a model is good enough

The same targets apply to the pilot measurement of the open-source model (§4):

| Measure | Target |
|---|---|
| Wrong person accepted (FAR) | ≤ 0.1 % at the accept threshold |
| Right person refused (FRR) | ≤ 3 % (the review band and cards catch the rest) |
| 1:N in a 1,000-student school: wrong person at rank 1 | ≤ 0.1 % |
| Children (8–18) | within 2× of the adult error rates |
| Speed on a USD 150 Android tablet | ≤ 300 ms per face |
| Size | ≤ 10 MB |

## 9. Open decisions

1. Who runs the 4-week pilot, and in which school.
2. When the lawyer reviews the consent form and §2.
3. Only if training is revived: the budget, the data sources and a children's evaluation set.
