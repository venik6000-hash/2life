--
-- PostgreSQL database dump
--

\restrict iPUhnPIbHahkrEhm21MRobD5xILd7KQpowKSjvRKjRldVvz83zALeXUqBKDyXTU

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.stages DROP CONSTRAINT IF EXISTS stages_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.role_sections DROP CONSTRAINT IF EXISTS role_sections_role_id_fkey;
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_id_fkey;
ALTER TABLE IF EXISTS ONLY public.protocol_revisions DROP CONSTRAINT IF EXISTS protocol_revisions_stage_id_fkey;
ALTER TABLE IF EXISTS ONLY public.nutrition_revisions DROP CONSTRAINT IF EXISTS nutrition_revisions_stage_id_fkey;
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_stage_id_fkey;
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.doctors DROP CONSTRAINT IF EXISTS doctors_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.client_assignments DROP CONSTRAINT IF EXISTS client_assignments_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.client_assignments DROP CONSTRAINT IF EXISTS client_assignments_client_id_fkey;
ALTER TABLE IF EXISTS ONLY public.analytics_values DROP CONSTRAINT IF EXISTS analytics_values_marker_id_fkey;
ALTER TABLE IF EXISTS ONLY public.analytics_markers DROP CONSTRAINT IF EXISTS analytics_markers_category_id_fkey;
ALTER TABLE IF EXISTS ONLY public.analytics_categories DROP CONSTRAINT IF EXISTS analytics_categories_client_id_fkey;
DROP INDEX IF EXISTS public.uq_av_marker_date;
DROP INDEX IF EXISTS public.uq_am_cat_name;
DROP INDEX IF EXISTS public.uq_ac_client_name;
DROP INDEX IF EXISTS public.idx_je_client;
DROP INDEX IF EXISTS public.idx_ca_user;
DROP INDEX IF EXISTS public.idx_ca_client;
DROP INDEX IF EXISTS public.idx_av_marker;
DROP INDEX IF EXISTS public.idx_al_ts;
DROP INDEX IF EXISTS public.idx_al_client;
DROP INDEX IF EXISTS public.idx_ac_client;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.stages DROP CONSTRAINT IF EXISTS stages_pkey;
ALTER TABLE IF EXISTS ONLY public.stages DROP CONSTRAINT IF EXISTS stages_client_id_stage_num_key;
ALTER TABLE IF EXISTS ONLY public.roles DROP CONSTRAINT IF EXISTS roles_pkey;
ALTER TABLE IF EXISTS ONLY public.roles DROP CONSTRAINT IF EXISTS roles_name_key;
ALTER TABLE IF EXISTS ONLY public.role_sections DROP CONSTRAINT IF EXISTS role_sections_role_id_section_id_key;
ALTER TABLE IF EXISTS ONLY public.role_sections DROP CONSTRAINT IF EXISTS role_sections_pkey;
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_id_permission_key;
ALTER TABLE IF EXISTS ONLY public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_pkey;
ALTER TABLE IF EXISTS ONLY public.reference_data DROP CONSTRAINT IF EXISTS reference_data_pkey;
ALTER TABLE IF EXISTS ONLY public.protocol_revisions DROP CONSTRAINT IF EXISTS protocol_revisions_pkey;
ALTER TABLE IF EXISTS ONLY public.nutrition_revisions DROP CONSTRAINT IF EXISTS nutrition_revisions_pkey;
ALTER TABLE IF EXISTS ONLY public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.doctors DROP CONSTRAINT IF EXISTS doctors_pkey;
ALTER TABLE IF EXISTS ONLY public.doctors DROP CONSTRAINT IF EXISTS doctors_name_key;
ALTER TABLE IF EXISTS ONLY public.clients DROP CONSTRAINT IF EXISTS clients_pkey;
ALTER TABLE IF EXISTS ONLY public.client_assignments DROP CONSTRAINT IF EXISTS client_assignments_user_id_client_id_key;
ALTER TABLE IF EXISTS ONLY public.client_assignments DROP CONSTRAINT IF EXISTS client_assignments_pkey;
ALTER TABLE IF EXISTS ONLY public.analytics_values DROP CONSTRAINT IF EXISTS analytics_values_pkey;
ALTER TABLE IF EXISTS ONLY public.analytics_markers DROP CONSTRAINT IF EXISTS analytics_markers_pkey;
ALTER TABLE IF EXISTS ONLY public.analytics_categories DROP CONSTRAINT IF EXISTS analytics_categories_pkey;
ALTER TABLE IF EXISTS ONLY public.activity_log DROP CONSTRAINT IF EXISTS activity_log_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.roles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.role_sections ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.role_permissions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.reference_data ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.protocol_revisions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.nutrition_revisions ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.journal_entries ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.doctors ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.client_assignments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.analytics_values ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.analytics_markers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.analytics_categories ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.activity_log ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP SEQUENCE IF EXISTS public.stages_id_seq;
DROP TABLE IF EXISTS public.stages;
DROP SEQUENCE IF EXISTS public.roles_id_seq;
DROP TABLE IF EXISTS public.roles;
DROP SEQUENCE IF EXISTS public.role_sections_id_seq;
DROP TABLE IF EXISTS public.role_sections;
DROP SEQUENCE IF EXISTS public.role_permissions_id_seq;
DROP TABLE IF EXISTS public.role_permissions;
DROP SEQUENCE IF EXISTS public.reference_data_id_seq;
DROP TABLE IF EXISTS public.reference_data;
DROP SEQUENCE IF EXISTS public.protocol_revisions_id_seq;
DROP TABLE IF EXISTS public.protocol_revisions;
DROP SEQUENCE IF EXISTS public.nutrition_revisions_id_seq;
DROP TABLE IF EXISTS public.nutrition_revisions;
DROP SEQUENCE IF EXISTS public.journal_entries_id_seq;
DROP TABLE IF EXISTS public.journal_entries;
DROP SEQUENCE IF EXISTS public.doctors_id_seq;
DROP TABLE IF EXISTS public.doctors;
DROP TABLE IF EXISTS public.clients;
DROP SEQUENCE IF EXISTS public.client_assignments_id_seq;
DROP TABLE IF EXISTS public.client_assignments;
DROP SEQUENCE IF EXISTS public.analytics_values_id_seq;
DROP TABLE IF EXISTS public.analytics_values;
DROP SEQUENCE IF EXISTS public.analytics_markers_id_seq;
DROP TABLE IF EXISTS public.analytics_markers;
DROP SEQUENCE IF EXISTS public.analytics_categories_id_seq;
DROP TABLE IF EXISTS public.analytics_categories;
DROP SEQUENCE IF EXISTS public.activity_log_id_seq;
DROP TABLE IF EXISTS public.activity_log;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_log (
    id integer NOT NULL,
    ts text DEFAULT ''::text NOT NULL,
    action text DEFAULT ''::text NOT NULL,
    actor text DEFAULT ''::text NOT NULL,
    client_id text,
    client_name text DEFAULT ''::text NOT NULL,
    stage_id text,
    stage_title text DEFAULT ''::text NOT NULL,
    details_json text
);


ALTER TABLE public.activity_log OWNER TO postgres;

--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.activity_log_id_seq OWNER TO postgres;

--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;


--
-- Name: analytics_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_categories (
    id integer NOT NULL,
    client_id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.analytics_categories OWNER TO postgres;

--
-- Name: analytics_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.analytics_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.analytics_categories_id_seq OWNER TO postgres;

--
-- Name: analytics_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.analytics_categories_id_seq OWNED BY public.analytics_categories.id;


--
-- Name: analytics_markers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_markers (
    id integer NOT NULL,
    category_id integer NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    unit text DEFAULT ''::text NOT NULL,
    ref_min real DEFAULT 0 NOT NULL,
    ref_max real DEFAULT 0 NOT NULL,
    optimal text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.analytics_markers OWNER TO postgres;

--
-- Name: analytics_markers_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.analytics_markers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.analytics_markers_id_seq OWNER TO postgres;

--
-- Name: analytics_markers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.analytics_markers_id_seq OWNED BY public.analytics_markers.id;


--
-- Name: analytics_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.analytics_values (
    id integer NOT NULL,
    marker_id integer NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    flag_off boolean DEFAULT false NOT NULL
);


ALTER TABLE public.analytics_values OWNER TO postgres;

--
-- Name: analytics_values_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.analytics_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.analytics_values_id_seq OWNER TO postgres;

--
-- Name: analytics_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.analytics_values_id_seq OWNED BY public.analytics_values.id;


--
-- Name: client_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.client_assignments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    client_id text NOT NULL,
    assigned_by integer
);


ALTER TABLE public.client_assignments OWNER TO postgres;

--
-- Name: client_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.client_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.client_assignments_id_seq OWNER TO postgres;

--
-- Name: client_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.client_assignments_id_seq OWNED BY public.client_assignments.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clients (
    id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    short_name text DEFAULT ''::text NOT NULL,
    dob text DEFAULT ''::text NOT NULL,
    age integer DEFAULT 0 NOT NULL,
    sex text DEFAULT ''::text NOT NULL,
    avatar text DEFAULT ''::text NOT NULL,
    color text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.clients OWNER TO postgres;

--
-- Name: doctors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.doctors (
    id integer NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    user_id integer
);


ALTER TABLE public.doctors OWNER TO postgres;

--
-- Name: doctors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.doctors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.doctors_id_seq OWNER TO postgres;

--
-- Name: doctors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.doctors_id_seq OWNED BY public.doctors.id;


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.journal_entries (
    id integer NOT NULL,
    client_id text NOT NULL,
    stage_id integer NOT NULL,
    entry_num integer DEFAULT 0 NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    type text DEFAULT ''::text NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    author text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.journal_entries OWNER TO postgres;

--
-- Name: journal_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.journal_entries_id_seq OWNER TO postgres;

--
-- Name: journal_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.journal_entries_id_seq OWNED BY public.journal_entries.id;


--
-- Name: nutrition_revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nutrition_revisions (
    id integer NOT NULL,
    stage_id integer NOT NULL,
    revision_num integer DEFAULT 0 NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    data_json text DEFAULT '{}'::text NOT NULL
);


ALTER TABLE public.nutrition_revisions OWNER TO postgres;

--
-- Name: nutrition_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.nutrition_revisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.nutrition_revisions_id_seq OWNER TO postgres;

--
-- Name: nutrition_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.nutrition_revisions_id_seq OWNED BY public.nutrition_revisions.id;


--
-- Name: protocol_revisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.protocol_revisions (
    id integer NOT NULL,
    stage_id integer NOT NULL,
    revision_num integer DEFAULT 0 NOT NULL,
    date text DEFAULT ''::text NOT NULL,
    label text DEFAULT ''::text NOT NULL,
    groups_json text DEFAULT '[]'::text NOT NULL
);


ALTER TABLE public.protocol_revisions OWNER TO postgres;

--
-- Name: protocol_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.protocol_revisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.protocol_revisions_id_seq OWNER TO postgres;

--
-- Name: protocol_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.protocol_revisions_id_seq OWNED BY public.protocol_revisions.id;


--
-- Name: reference_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reference_data (
    id integer NOT NULL,
    type text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL
);


ALTER TABLE public.reference_data OWNER TO postgres;

--
-- Name: reference_data_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reference_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reference_data_id_seq OWNER TO postgres;

--
-- Name: reference_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reference_data_id_seq OWNED BY public.reference_data.id;


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    id integer NOT NULL,
    role_id integer NOT NULL,
    permission text NOT NULL,
    granted boolean DEFAULT false NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- Name: role_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.role_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.role_permissions_id_seq OWNER TO postgres;

--
-- Name: role_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.role_permissions_id_seq OWNED BY public.role_permissions.id;


--
-- Name: role_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_sections (
    id integer NOT NULL,
    role_id integer NOT NULL,
    section_id text NOT NULL,
    can_read boolean DEFAULT false NOT NULL,
    can_write boolean DEFAULT false NOT NULL
);


ALTER TABLE public.role_sections OWNER TO postgres;

--
-- Name: role_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.role_sections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.role_sections_id_seq OWNER TO postgres;

--
-- Name: role_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.role_sections_id_seq OWNED BY public.role_sections.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name text NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    is_system boolean DEFAULT false NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: stages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stages (
    id integer NOT NULL,
    client_id text NOT NULL,
    stage_num integer DEFAULT 0 NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    subtitle text DEFAULT ''::text NOT NULL,
    doctor text DEFAULT ''::text NOT NULL,
    doctor_role text DEFAULT ''::text NOT NULL,
    date_start text DEFAULT ''::text NOT NULL,
    date_end text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    phone text DEFAULT ''::text NOT NULL,
    city text DEFAULT ''::text NOT NULL,
    height real DEFAULT 0 NOT NULL,
    weight_current real DEFAULT 0 NOT NULL,
    weight_goal real DEFAULT 0 NOT NULL,
    bmi real DEFAULT 0 NOT NULL,
    waist real DEFAULT 0 NOT NULL,
    tasks_json text DEFAULT '[]'::text NOT NULL,
    syndromes_json text DEFAULT '[]'::text NOT NULL,
    diagnoses_json text DEFAULT '[]'::text NOT NULL,
    deficits_json text DEFAULT '[]'::text NOT NULL,
    auto_deficit_selection_json text DEFAULT '[]'::text NOT NULL,
    lab_order_selected_json text DEFAULT '{}'::text NOT NULL,
    lab_order_group_order_json text DEFAULT '[]'::text NOT NULL,
    nutrition_json text DEFAULT '{}'::text NOT NULL,
    injections_json text DEFAULT '[]'::text NOT NULL,
    injection_schedule_json text DEFAULT '{}'::text NOT NULL,
    questionnaire_json text DEFAULT '{}'::text NOT NULL
);


ALTER TABLE public.stages OWNER TO postgres;

--
-- Name: stages_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stages_id_seq OWNER TO postgres;

--
-- Name: stages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stages_id_seq OWNED BY public.stages.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'doctor'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    all_clients_access boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: activity_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log ALTER COLUMN id SET DEFAULT nextval('public.activity_log_id_seq'::regclass);


--
-- Name: analytics_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_categories ALTER COLUMN id SET DEFAULT nextval('public.analytics_categories_id_seq'::regclass);


--
-- Name: analytics_markers id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_markers ALTER COLUMN id SET DEFAULT nextval('public.analytics_markers_id_seq'::regclass);


--
-- Name: analytics_values id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_values ALTER COLUMN id SET DEFAULT nextval('public.analytics_values_id_seq'::regclass);


--
-- Name: client_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments ALTER COLUMN id SET DEFAULT nextval('public.client_assignments_id_seq'::regclass);


--
-- Name: doctors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors ALTER COLUMN id SET DEFAULT nextval('public.doctors_id_seq'::regclass);


--
-- Name: journal_entries id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);


--
-- Name: nutrition_revisions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nutrition_revisions ALTER COLUMN id SET DEFAULT nextval('public.nutrition_revisions_id_seq'::regclass);


--
-- Name: protocol_revisions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_revisions ALTER COLUMN id SET DEFAULT nextval('public.protocol_revisions_id_seq'::regclass);


--
-- Name: reference_data id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reference_data ALTER COLUMN id SET DEFAULT nextval('public.reference_data_id_seq'::regclass);


--
-- Name: role_permissions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_permissions_id_seq'::regclass);


--
-- Name: role_sections id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_sections ALTER COLUMN id SET DEFAULT nextval('public.role_sections_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: stages id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stages ALTER COLUMN id SET DEFAULT nextval('public.stages_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_log (id, ts, action, actor, client_id, client_name, stage_id, stage_title, details_json) FROM stdin;
1	2026-04-03T12:44:16.989Z	diagnoses_updated	Инна	c-1773270983915	Иванов Иван	1	Этап 1	\N
2	2026-04-03T12:44:17.910Z	diagnoses_updated	Инна	c-1773270983915	Иванов Иван	1	Этап 1	\N
\.


--
-- Data for Name: analytics_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_categories (id, client_id, name, sort_order) FROM stdin;
1	c-1774621590636	Общий анализ крови	0
2	c-1774621590636	Метаболизм	1
3	c-1774621590636	Пищеварение	2
4	c-1774621590636	Копрограмма	3
5	c-1774621590636	Нутриенты	4
6	c-1774621590636	Энергия	5
7	c-1774621590636	Стресс	6
8	c-1774621590636	Иммунитет и воспаление	7
9	c-1774621590636	Фибриноген	8
10	c-1774621590636	Ревматоидный фактор	9
11	c-1774621590636	РЭА	10
12	c-1774621590636	Органы и системы	11
13	c-1774621590636	Гормональный статус	12
14	c-1774621590636	ФСГ	13
15	c-1774621684239	Общий анализ крови	0
16	c-1774621684239	Индекс распределения эритроцитов (RDW-CV)	1
17	c-1774621684239	Метаболизм	2
18	c-1774621684239	Пищеварение	3
19	c-1774621684239	Нутриенты	4
20	c-1774621684239	Энергия	5
21	c-1774621684239	Стресс	6
22	c-1774621684239	Иммунитет и воспаление	7
23	c-1774621684239	Ревматоидный фактор	8
24	c-1774621684239	РЭА	9
25	c-1774621684239	Органы и системы	10
26	c-1774621684239	Гормональный статус	11
27	c-1774621684239	ГСПГ	12
28	c-1774621684239	ЛГ	13
29	c-1774621684239	Генетика	14
30	c-1774621510596	Общий анализ крови	0
31	c-1774621510596	Метаболизм	1
32	c-1774621510596	Пищеварение	2
33	c-1774621510596	Хеликобактер	3
34	c-1774621510596	Нутриенты	4
35	c-1774621510596	Энергия	5
36	c-1774621510596	Стресс	6
37	c-1774621510596	Иммунитет и воспаление	7
38	c-1774621510596	Ревматоидный фактор	8
39	c-1774621510596	РЭА	9
40	c-1774621510596	Органы и системы	10
41	c-1774621510596	Гормональный статус	11
42	c-1774621510596	Антимюллеров гормон (АМГ)	12
43	c-1774621510596	Оценка качества тела	13
44	c-1773270983915	Общий анализ крови	0
45	c-1773270983915	Метаболизм	1
46	c-1773270983915	Пищеварение	2
47	c-1773270983915	Нутриенты	3
48	c-1773270983915	Энергия	4
49	c-1773270983915	Стресс	5
50	c-1773270983915	Иммунитет и воспаление	6
51	c-1773270983915	Ревматоидный фактор	7
52	c-1773270983915	Антистрептолизин О (АСЛ-О)	8
53	c-1773270983915	Органы и системы	9
54	c-1773270983915	Эли Висцеро тест 24	10
55	c-1773270983915	Гормональный статус	11
56	c-1773270983915	ПСА свободный	12
57	c-1773270983915	Антимюллеров гормон (АМГ)	13
58	c-1773270983915	Генетика	14
\.


--
-- Data for Name: analytics_markers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_markers (id, category_id, name, unit, ref_min, ref_max, optimal, sort_order) FROM stdin;
1	1	Гемоглобин HGB	г/л	132	172	132-173 г/л	0
2	1	Эритроциты RBC	г/л	4.28	5.78	4,5-5,5 г/л	1
3	1	Ср.объем эритроцитов MCV	фл	82	98	88-95 фл	2
4	1	Среднее содержание Гемо в Эри MCH	пг	27.93	33.24	28-34 пг	3
5	1	Средняя концентрация гемо в эри MCHC	г/л	319	356	320 - 350 г/л	4
6	1	Распределения эритроцитов по объему RDW	%	0	0	11-14,8%	5
7	1	Гематокрит HCT	%	39.51	50.95	40-49 %	6
8	1	Тромбоциты PLT	г/л	150	360	170-350 г/л	7
9	1	Средний объем тромбоцитов MPV	фл	0	0	7-10 фл	8
10	1	Тромбокрит		1.08	2.82		9
11	1	Индекс распред тромбоцитов (PDW)		9.3	16.7		10
12	1	Лейкоциты WBC	г/л	3.9	10.9	4-9 г/л	11
13	1	Нейтрофилы NE	%	37.95	71.44	45-74 %	12
14	1	Эозинофилы EOS	%	0.3	5.4	до 2,5%	13
15	1	Базофилы BAS	%	0	1	0-1%	14
16	1	Моноциты MO	%	4.8	13.8	3-8 %	15
17	1	Лимфоциты LY	%	24	48.4	18 - 40%	16
18	1	СОЭ	мм/час	0	15	5-9 мм/час	17
19	2	Глюкоза	ммоль/л	0	0	4,6 - 5,1 ммоль/л	0
20	2	Гликированный гемоглобин	%	0	0	4,6 - 5,6 %	1
21	2	Инсулин	мкЕд/мл	2.6	24.9	5-7 мкЕд/мл	2
22	2	Индекс Хома		0	0	0 - 1,3	3
23	2	Лептин		0	0		4
24	2	Общий белок	г/л	64	83	75 - 80 г/л	5
25	2	Альбумин	%	0	0	минимум 50% от ОБ	6
26	2	Общий холестерин	ммоль/л	4.11	6.1	3,6 - 5,2 ммоль/л	7
27	2	ЛПВП	ммоль/л	0	0	не ниже 1,3 ммоль/л	8
28	2	ЛПНП	ммоль/л	0	0	2,6 - 3,8 ммоль/л	9
29	2	ЛПОНП	ммоль/л	0.26	1.04	менее 0,5 ммоль/л	10
30	2	не-ЛПВП	ммоль/л	0	0	ммоль/л	11
31	2	Индекс атерогенности (коэф. атерогенности)		0	0		12
32	2	Триглицериды	ммоль/л	0	0	менее 1 ммоль/л	13
33	2	АЛТ (АЛаТ)	ед/л	0	0	10 - 31 ед/л	14
34	2	АСТ(АСаТ)	ед/л	0	0	10 - 31 ед/л	15
35	2	ГГПТ (ГГТ)	ед/л	0	0	20 - 40 ед/л	16
36	2	Мочевая кислота	мкмоль/л	202.3	416.5	150-300 мкмоль/л	17
37	2	Мочевина	ммоль/л	2.1	7.1	середина референса ммоль/л	18
38	2	Креатинин		64	104	середина референса	19
39	2	Щелочная фосфатаза	ед/л	40	150	середина референса ед/л	20
40	2	Креатинкиназа		0	0		21
41	2	Креатинкиназа-МВ		3	25		22
42	2	Альфа-амилаза		25	125		23
43	3	Билирубин общий	мкмоль/л	0	0	5 - 15 мкмоль/л	0
44	3	Билирубин непрямой	мкмоль/л	0	0	3,5 - 17 мкмоль/л	1
45	3	Билирубин прямой	мкмоль/л	0	0	1,7-3,25 мкмоль/л	2
46	4	Эластаза панкреатическая		0	0	>200	0
47	4	Пепсиноген 1		30	130		1
48	4	Пепсиноген II		4	22		2
49	4	Helicobacter pylori, IgG		0	0		3
50	4	Гастрин		13	115		4
51	4	Антитела к париетальным клеткам желудка		0	0	<40	5
52	4	Хеликобактер дыхательный тест, IgG не обнаружен		0	0	<4	6
53	4	IgG на глютен		0	0	< значимых значений	7
54	4	IgG на казеин		0	0	< значимых значений	8
55	4	IgG белок куриный		0	0.88	< значимых значений	9
56	4	IgG желток куриный		0	0.88	< значимых значений	10
57	4	IgG к другим продуктам		0	0.88	< 5000	11
58	4	Антитела к тканевой трансглутаминазе IgA		0	0		12
59	4	АТ к эндомизию IgA		0	0		13
60	4	Эозинофильно катионный белок (ЭКБ)		0	0		14
61	5	Витамин Д		4.9	55.8	60-80	0
62	5	Фолиевая кислота (В9)		3.1	20.5	верхняя граница референса	1
63	5	В12		187	883	верхняя граница референса	2
64	5	В6		5.3	46.7		3
65	5	Ферритин	мкг/л	0	0	90-180 мкг/л	4
66	5	Железо сыв	мкмоль/л	5.8	34.5	15-30 мкмоль/л	5
67	5	ЛЖСС		0	0	45-55	6
68	5	Трансферрин	г/л	0	0	2,6-3 г/л	7
69	5	Магний волосы		10	250	> 160	8
70	5	Марганец волосы		0.07	3	> 1,6	9
71	5	Селен волосы		0.155	1.4		10
72	5	Хром волосы		0.02	1		11
73	5	Алюмилий волосы		0	0	< 20	12
74	5	Цинк сыворотка крови	мкмоль/л	0.75	1.5	верхняя граница референса мкмоль/л	13
75	5	Цинк волосы		84	342		14
76	5	Натрий		136	145		15
77	5	Хлориды		98	106		16
78	5	Калий		3.5	5.1		17
79	6	ТТГ	мЕд/л	0.27	4.2	0,5 - 2 мЕд/л	0
80	6	Т3 свободный	пг/мл	3	5.6	середина референса пг/мл	1
81	6	Т4 свободный		9	19.05	верхняя треть диапазона нг/дл	2
82	6	Антитела к тиреопероксидазе (АТ-ТПО)		0	0	< 2 МЕ/мл	3
83	6	Антитела к тиреглобулину (АТ-ТГ)		0	115	< 2 МЕ/мл	4
84	7	Кортизол		101.2	535.7		0
85	7	Кортизол, слюна (утро)	нмоль/л	0.94	15.1	7 - 14 нмоль/л	1
86	7	Кортизил, слюна (вечер)	нмоль/л	0	0	0,8 - 2,86 нмоль/л	2
87	7	Дегидроэпиандростерон - ДГЭА, слюна, мкг/дл		0.04	0.17	>0,1	3
88	8	СОЭ		0	0	<10	0
89	8	С-реативный белок (СРБ)		0	0	< 1	1
90	8	Гомоцистеин		0	0	4 - 7	2
91	9	Вирус гепатита С (Anti-HCV), антитела\r\n(качеств.)		0	0		0
92	10	IgE общий		0	100	<100МЕ/мл	0
93	11	Кальпротектин		0	0	< 40	0
94	12	Скорость клубочковой фильтрации (СКФ)		0	0	90-120	0
95	13	Тестостерон общий		8.9	42		0
96	13	Тестостерон свободный		12.3	46.6		1
97	13	ИСТ- индекс своб. тестостерона		24.5	113.3		2
98	13	ГСПГ		16.2	68.5		3
99	13	Пролактин		73	407		4
100	14	ЛГ		0.57	12.07		0
101	14	Эстрадиол		0	0		1
102	14	Прогестерон		10	100		2
103	14	ПСА общий		0	0		3
104	15	Гемоглобин HGB	г/л	132	172	132-173 г/л	0
105	15	Эритроциты RBC	г/л	4.28	5.78	4,5-5,5 г/л	1
106	15	Ср.объем эритроцитов MCV	фл	82	98	88-95 фл	2
107	15	Среднее содержание Гемо в Эри MCH	пг	27.93	33.24	28-34 пг	3
108	15	Средняя концентрация гемо в эри MCHC	г/л	319	356	320 - 350 г/л	4
109	15	Распределения эритроцитов по объему RDW	%	0	0	11-14,8%	5
110	16	Гематокрит HCT	%	39.51	50.95	40-49 %	0
111	16	Тромбоциты PLT	г/л	150	360	170-350 г/л	1
112	16	Средний объем тромбоцитов MPV	фл	0	0	7-10 фл	2
113	16	Тромбокрит		1.08	2.82		3
114	16	Индекс распред тромбоцитов (PDW)		9.3	16.7		4
115	16	Лейкоциты WBC	г/л	3.9	10.9	4-9 г/л	5
116	16	Нейтрофилы NE	%	48	78	45-74 %	6
117	16	Эозинофилы EOS	%	0.3	5.4	до 2,5%	7
118	16	Базофилы BAS	%	0	1	0-1%	8
119	16	Моноциты MO	%	4.8	13.8	3-8 %	9
120	16	Лимфоциты LY	%	19	37	18 - 40%	10
121	16	СОЭ	мм/час	0	15	5-9 мм/час	11
122	17	Глюкоза	ммоль/л	0	0	4,6 - 5,1 ммоль/л	0
123	17	Гликированный гемоглобин	%	0	0	4,6 - 5,6 %	1
124	17	Инсулин	мкЕд/мл	2.6	24.9	5-7 мкЕд/мл	2
125	17	Индекс Хома		0	0	0 - 1,3	3
126	17	Общий белок	г/л	64	83	75 - 80 г/л	4
127	17	Альбумин	%	0	0	минимум 50% от ОБ	5
128	17	Общий холестерин	ммоль/л	4.11	6.1	3,6 - 5,2 ммоль/л	6
129	17	ЛПВП	ммоль/л	0	0	не ниже 1,3 ммоль/л	7
130	17	ЛПНП		0	0	менее 3,5	8
131	17	ЛПОНП	ммоль/л	0.26	1.04	менее 0,5 ммоль/л	9
132	17	не-ЛПВП	ммоль/л	0	0	ммоль/л	10
133	17	Индекс атерогенности (коэф. атерогенности)		0	0		11
134	17	Триглицериды	ммоль/л	0	0	менее 1 ммоль/л	12
135	17	АЛТ (АЛаТ)	ед/л	0	0	10 - 31 ед/л	13
136	17	АСТ(АСаТ)	ед/л	0	0	10 - 31 ед/л	14
137	17	ГГПТ (ГГТ)	ед/л	0	0	20 - 40 ед/л	15
138	17	Мочевая кислота	мкмоль/л	202.3	416.5	150-300 мкмоль/л	16
139	17	Мочевина	ммоль/л	2.1	7.1	середина референса ммоль/л	17
140	17	Креатинин		49	90	середина референса	18
141	17	Щелочная фосфатаза	ед/л	0	270	середина референса ед/л	19
142	18	Билирубин общий	мкмоль/л	0	0	5 - 15 мкмоль/л	0
143	18	Билирубин непрямой	мкмоль/л	0	0	3,5 - 17 мкмоль/л	1
144	18	Билирубин прямой	мкмоль/л	0	0	1,7-3,25 мкмоль/л	2
145	18	Эластаза панкреатическая		0	0	>200	3
146	18	Пепсиноген 1		30	130		4
147	18	Гастрин		13	115		5
148	18	Антитела к париетальным клеткам желудка		0	0	<40	6
149	18	Хеликобактер дыхательный тест, IgG не обнаружен		0	0	<4	7
150	18	IgG на глютен		0	0	< значимых значений	8
151	18	IgG на казеин		0	0	<50	9
152	18	IgG яйцо куриное		0	0	< значимых значений	10
153	18	IgG к другим продуктам		0	0	< 5000	11
154	18	Антитела к тканевой трансглутаминазе IgA		0	0		12
155	18	АТ к эндомизию IgA		0	0		13
156	18	Эозинофильно катионный белок (ЭКБ)		0	0		14
157	19	Витамин Д		4.9	55.8	60-80	0
158	19	Фолиевая кислота (В9)		3.1	20.5	верхняя граница референса	1
159	19	В12		187	883	верхняя граница референса	2
160	19	В6		5.3	46.7		3
161	19	Ферритин	мкг/л	0	0	90-180 мкг/л	4
162	19	Железо сыв	мкмоль/л	5.8	34.5	15-30 мкмоль/л	5
163	19	ЛЖСС		0	0	45-55	6
164	19	Трансферрин	г/л	0	0	2-3 г/л	7
165	19	% насыщения\r\nтрансферрина		16	50	30 - 40	8
166	19	Магний волосы		10	250	> 160	9
167	19	Марганец волосы		0.07	3	> 1,6	10
168	19	Селен волосы		0.155	1.4		11
169	19	Хром волосы		0.02	1		12
170	19	Алюмилий волосы		0	0	< 20	13
171	19	Цинк сыворотка крови	мкмоль/л	11.1	19.5	верхняя граница референса мкмоль/л	14
172	19	Цинк волосы		84	342		15
173	19	Натрий		136	145		16
174	19	Хлориды		98	106		17
175	19	Калий		3.5	5.1		18
176	20	ТТГ	мЕд/л	0.27	4.2	0,5 - 2 мЕд/л	0
177	20	Т3 свободный	пг/мл	3	5.6	середина референса пг/мл	1
178	20	Т4 свободный		9	19.05	верхняя треть диапазона нг/дл	2
179	20	Антитела к тиреопероксидазе (АТ-ТПО)		0	0		3
180	20	Антитела к тиреглобулину (АТ-ТГ)		0	0		4
181	21	Кортизол, слюна (утро)	нмоль/л	0.94	15.1	7 - 14 нмоль/л	0
182	21	Кортизил, слюна (вечер)	нмоль/л	0	0	0,8 - 2,86 нмоль/л	1
183	21	Дегидроэпиандростерон - ДГЭА, слюна, мкг/дл		0.04	0.17	>0,1	2
184	22	СОЭ		0	0	<10	0
185	22	С-реативный белок (СРБ)		0	0	< 1	1
186	22	Гомоцистеин		0	0	4 - 7	2
187	23	IgE общий		0	100	<100МЕ/мл	0
188	24	Кальпротектин		0	0	< 40	0
189	25	Скорость клубочковой фильтрации (СКФ)		0	0	90-120	0
190	26	Тестостерон общий		2.49	8.36		0
191	26	Тестостерон свободный		35	200		1
192	27	Пролактин	нг/мл	86	324	10 нг/мл	0
193	28	Эстрадиол		1	20		0
194	28	Прогестерон		10	100		1
195	29	Лактазная недостаточность, МСМ6 (-\n13910 С>T)		0	0	Лактазная недостаточность.pdf	0
196	30	Гемоглобин HGB	г/л	132	173	140-165 г/л	0
197	30	Эритроциты RBC	г/л	4.3	5.7	4,5-5,5 г/л	1
198	30	Ср.объем эритроцитов MCV	фл	80	99	88-95 фл	2
199	30	Среднее содержание Гемо в Эри MCH	пг	27	34	28-34 пг	3
200	30	Средняя концентрация гемо в эри MCHC	г/л	319	356	300 - 380 г/л	4
201	30	Индекс распределения эритроцитов RDW-SD		37	54		5
202	30	Распределения эритроцитов по объему RDW	%	9.3	16.7	11-14,8%	6
203	30	Гематокрит HCT	%	39	49	40-42 %	7
204	30	Тромбоциты PLT	г/л	150	400	170-350 г/л	8
205	30	Средний объем тромбоцитов MPV	фл	8.8	12.2	7-10 фл	9
206	30	Тромбокрит		0.12	0.35		10
207	30	Индекс распред тромбоцитов (PDW)		9.3	16.7		11
208	30	Лейкоциты WBC	г/л	4.5	11	4-9 г/л	12
209	30	Нейтрофилы NE	%	47	72	45-74 %	13
210	30	Эозинофилы EOS	%	1	5	до 2,5%	14
211	30	Базофилы BAS	%	0	1	0-1%	15
212	30	Моноциты MO	%	5	12	3-8 %	16
213	30	Лимфоциты LY	%	19	37	18 - 40%	17
214	30	СОЭ	мм/час	2	20	5-9 мм/час	18
215	31	Глюкоза	ммоль/л	4.1	5.9	4,6 - 5,1 ммоль/л	0
216	31	Гликированный гемоглобин	%	0	0	4,6 - 5,6 %	1
217	31	Инсулин	мкЕд/мл	2.6	24.9	5-7 мкЕд/мл	2
218	31	Индекс Хома		0	0	0 - 1,3	3
219	31	Проинсулин		30	180		4
220	31	С-пептид		1	4.3		5
221	31	Фруктозамин		205	285		6
222	31	Лактат		0.5	2.2		7
223	31	Общий белок	г/л	64	83	75 - 80 г/л	8
224	31	Альбумин	%	0	0	минимум 50% от ОБ	9
225	31	Общий холестерин	ммоль/л	3.2	5.2	3,6 - 5,2 ммоль/л	10
226	31	ЛПВП	ммоль/л	0	0	не ниже 1,3 ммоль/л	11
227	31	ЛПНП	ммоль/л	0.1	4.14	2,6 - 3,8 ммоль/л	12
228	31	не-ЛПВП	ммоль/л	0	0	ммоль/л	13
229	31	ЛПОНП	ммоль/л	0	0	менее 0,5 ммоль/л	14
230	31	Индекс атерогенности (коэф. атерогенности)		0	0		15
231	31	Триглицериды	ммоль/л	0.1	1.7	менее 1 ммоль/л	16
232	31	АЛТ (АЛаТ)	ед/л	0	0	< 40 ед/л	17
233	31	АСТ(АСаТ)	ед/л	0	0	< 40 ед/л	18
234	31	ГГПТ (ГГТ)	ед/л	10	71	20-27 ед/л	19
235	31	Мочевая кислота	мкмоль/л	202.3	416.5	220-400 мкмоль/л	20
236	31	Мочевина	ммоль/л	2.8	7.2	середина референса ммоль/л	21
237	31	Креатинин		74	110	середина референса	22
238	31	Щелочная фосфатаза	ед/л	40	129	90-120 ед/л	23
239	32	Билирубин общий	мкмоль/л	5	21	5 - 15 мкмоль/л	0
240	32	Билирубин непрямой	мкмоль/л	0	0	3,5 - 17 мкмоль/л	1
241	32	Билирубин прямой	мкмоль/л	1.2	5	1,7-3,25 мкмоль/л	2
242	33	IgG на глютен		0	0	< значимых значений	0
243	33	IgG на казеин		0	0	< значимых значений	1
244	33	IgG яйцо куриное		0	0	< значимых значений	2
245	33	IgG к другим продуктам		0	0	< значимых значений	3
246	33	Эозинофильно катионный белок (ЭКБ)	нг/мл	0	24	нг/мл	4
247	34	Витамин Д	нг/мл	0	0	60-80 нг/мл	0
248	34	Витамин B6 (пиридоксин)		8.7	27.2		1
249	34	Фолиевая кислота (В9)		3.9	26.8	> 20	2
250	34	В12		250	1100	> 700	3
251	34	Ферритин	мкг/л	30	400	90-180 мкг/л	4
252	34	Железо сыв	мкмоль/л	0	0	15-30 мкмоль/л	5
253	34	ЛЖСС		0	0	45-55	6
254	34	Трансферрин	г/л	2	3.6	2,6-3 г/л	7
255	34	Коэффициент насыщения трансферрина железом		17.8	43.3		8
256	34	Хлор		0	0	92-112	9
257	34	Цинк		11	19.5	> 15	10
258	34	Натрий		1000	3000		11
259	34	Селен (Se) в крови		0.09	0.2	мкг/мл	12
260	34	Йод (I) в моче		0.03	0.65	мкг/мл	13
261	35	ТТГ	мЕд/л	0.27	4.2	0,5 - 2 мЕд/л	0
262	35	Т3 свободный	пг/мл	2.84	4.39	середина референса пг/мл	1
263	35	Т4 свободный		1.04	1.65	верхняя треть диапазона нг/дл	2
264	35	Антитела к тиреопероксидазе (АТ-ТПО)		0	0	< 2 МЕ/мл	3
265	35	Антитела к тиреглобулину (АТ-ТГ)		0	0	< 2 МЕ/мл	4
266	36	Кортизол, кровь (утро)	нмоль/л	6.2	19.4	12 - 20 нмоль/л	0
267	36	Кортизил, слюна (утро)	нмоль/л	0.6	6.1	0,8 - 2,86 нмоль/л	1
268	36	Дегидроэпиандростерон - ДГЭА, кровь, мкг/дл		140	449	>300	2
269	37	СОЭ		0	0	<10	0
270	37	С-реативный белок (СРБ)		0.3	5	< 1	1
271	37	Гомоцистеин	мкмоль/л	6	16	4 - 7 мкмоль/л	2
272	37	Фибриноген		1.8	3.5		3
273	38	IgE общий		0	0	МЕ/мл	0
274	39	Кальпротектин		0	0	< 40	0
275	39	Омега-3 индекс		0	4		1
276	39	Антитела к островковым клеткам (ICA)		0	0		2
277	39	Антитела к глутаматдекарбоксилазе (anti-GAD)		0	0		3
278	39	Антитела к инсулину		0	0		4
279	40	Скорость клубочковой фильтрации (СКФ)		0	0	90-120	0
280	41	Тестостерон свободный в слюне	пг/мл	35	200	пг/мл	0
281	41	ГСПГ		18.3	54.1	примерно равен возрасту	1
282	41	Пролактин	нг/мл	4	15.2	10 нг/мл	2
283	41	ФСГ		1.5	12.4		3
284	41	ЛГ		1.7	8.6		4
285	41	Эстрадиол		11.3	43		5
286	42	Дигидротестостерон		175	913		0
287	42	ХГЧ		0	0	0-1,06	1
288	43	мышцы		0	0	> 55	0
289	43	жиры	%	0	0	18-23%	1
290	43	висцеральный жир	%	0	0	3-7%	2
291	43	вода	%	0	0	> 65%	3
292	44	Гемоглобин HGB	г/л	132	172		0
293	44	Эритроциты RBC	г/л	4.28	5.78		1
294	44	Ср.объем эритроцитов MCV	фл	82	98		2
295	44	Среднее содержание Гемо в Эри MCH	пг	27.93	33.24		3
296	44	Средняя концентрация гемо в эри MCHC	г/л	319	356		4
297	44	Распределения эритроцитов по объему RDW	%	0	0		5
298	44	Гематокрит HCT	%	39.51	50.95		6
299	44	Тромбоциты PLT	г/л	150	360		7
300	44	Средний объем тромбоцитов MPV	фл	0	0		8
301	44	Тромбокрит		1.08	2.82		9
302	44	Индекс распред тромбоцитов (PDW)		9.3	16.7		10
303	44	Лейкоциты WBC	г/л	3.9	10.9		11
304	44	Нейтрофилы NE	%	37.95	71.44		12
305	44	Эозинофилы EOS	%	0.3	5.4		13
306	44	Базофилы BAS	%	0	1		14
307	44	Моноциты MO	%	4.8	13.8		15
308	44	Лимфоциты LY	%	24	48.4		16
309	44	СОЭ	мм/час	0	15		17
310	45	Глюкоза	ммоль/л	3.9	5.5	4.3-5.1	0
311	45	Гликированный гемоглобин	%	4	5.6	4.8-5.3	1
312	45	Инсулин	мкЕд/мл	2.6	24.9	4-8	2
313	45	Индекс Хома		0	2.7	0.7-1.8	3
314	45	Общий холестерин	ммоль/л	0	5.2	3.8-4.8	4
315	45	ЛПНП	ммоль/л	0	3	1.8-2.6	5
316	45	ЛПВП	ммоль/л	1	2.2	1.3-1.9	6
317	45	Триглицериды	ммоль/л	0	1.7	0.6-1.3	7
318	45	АЛТ (АЛаТ)	ед/л	0	41	10-30	8
319	45	АСТ(АСаТ)	ед/л	0	40	10-30	9
320	45	ГГПТ (ГГТ)	ед/л	10	71	15-45	10
321	46	Билирубин общий	мкмоль/л	5	21	7-17	0
322	46	Билирубин прямой	мкмоль/л	0	5	1-4	1
323	46	Билирубин непрямой	мкмоль/л	3	17	5-13	2
324	46	Панкреатическая амилаза	ед/л	13	53	20-45	3
325	46	Эластаза панкреатическая	мкг/г	200	500	250-500	4
326	46	Гастрин	пг/мл	13	115	30-90	5
327	47	25-OH Витамин D	нг/мл	30	100	40-60	0
328	47	Витамин B12	пг/мл	197	771	450-700	1
329	47	Фолиевая кислота	нг/мл	3.1	20.5	7-14	2
330	47	Ферритин	нг/мл	30	400	70-120	3
331	47	Железо сывороточное	мкмоль/л	11.6	31.3	18-25	4
332	47	Цинк	мкмоль/л	10.7	22.9	14-18	5
333	47	Магний	ммоль/л	0.66	1.07	0.82-0.95	6
334	48	ТТГ	мЕд/л	0.4	4	1-2	0
335	48	Т3 свободный	пмоль/л	3.1	6.8	4.6-5.8	1
336	48	Т4 свободный	пмоль/л	12	22	14-18	2
337	48	Креатинкиназа (КФК)	ед/л	39	308	80-180	3
338	49	Кортизол утро	нмоль/л	138	690	250-500	0
339	49	Кортизол вечер	нмоль/л	64	327	90-180	1
340	49	ДГЭА-С	мкмоль/л	2.17	15.2	6-11	2
341	49	Пролактин	мЕд/л	86	324	120-260	3
342	50	С-реактивный белок (СРБ)	мг/л	0	5	0-1	0
343	50	Гомоцистеин	мкмоль/л	5	15	6-9	1
344	50	IgE общий	МЕ/мл	0	100	0-60	2
345	50	Новый		0	0		3
346	51	Ревматоидный фактор	МЕ/мл	0	14	0-10	0
347	52	АСЛ-О	МЕ/мл	0	200	0-150	0
348	53	Креатинин	мкмоль/л	62	115	75-95	0
349	53	Мочевина	ммоль/л	2.8	7.2	4-6	1
350	53	Мочевая кислота	мкмоль/л	210	420	250-350	2
351	53	Щелочная фосфатаза	ед/л	40	130	60-100	3
352	54	Индекс микробиоты	балл	0	100	70-90	0
353	54	Маркер воспаления кишечника	балл	0	100	0-30	1
354	55	Тестостерон общий	нмоль/л	8.64	29	14-24	0
355	55	Тестостерон свободный	пг/мл	4.5	42	12-25	1
356	55	ЛГ	мЕд/л	1.7	8.6	3-6	2
357	55	ФСГ	мЕд/л	1.5	12.4	2-6	3
358	56	ПСА свободный	нг/мл	0	0.93	0.1-0.5	0
359	56	ПСА общий	нг/мл	0	4	0.4-2	1
360	57	АМГ	нг/мл	0	12	1-5	0
361	58	MTHFR C677T (риск,%)	%	0	100	0-20	0
362	58	COMT V158M (риск,%)	%	0	100	0-20	1
\.


--
-- Data for Name: analytics_values; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.analytics_values (id, marker_id, date, value, flag_off) FROM stdin;
1	1	01.04.2025	167	f
2	1	01.02.2025	162	f
3	1	01.01.2025	160	f
4	1	01.03.2026	160	f
5	2	01.04.2025	5.85	f
6	2	01.02.2025	5.63	f
7	2	01.01.2025	5.52	f
8	2	01.03.2026	5.58	f
9	3	01.04.2025	84.6	f
10	3	01.02.2025	86.7	f
11	3	01.01.2025	86.7	f
12	3	01.03.2026	87.7	f
13	4	01.04.2025	28.5	f
14	4	01.02.2025	28.8	f
15	4	01.01.2025	29.1	f
16	4	01.03.2026	28.6	f
17	5	01.04.2025	337	f
18	5	01.02.2025	332	f
19	5	01.01.2025	334	f
20	5	01.03.2026	327	f
21	6	01.04.2025	12.3	f
22	6	01.01.2025	13.5	f
23	6	01.03.2026	12.9	f
24	7	01.04.2025	49.5	f
25	7	01.02.2025	48.8	f
26	7	01.01.2025	47.9	f
27	7	01.03.2026	48.9	f
28	8	01.04.2025	235	f
29	8	01.02.2025	215	f
30	8	01.01.2025	232	f
31	8	01.03.2026	209	f
32	9	01.02.2025	12.2	f
33	9	01.01.2025	11.7	f
34	10	01.02.2025	0.26	f
35	10	01.01.2025	0.27	f
36	11	01.02.2025	15.7	f
37	11	01.01.2025	14.9	f
38	12	01.04.2025	6.07	f
39	12	01.02.2025	4.37	f
40	12	01.01.2025	4.69	f
41	12	01.03.2026	4.22	f
42	13	01.04.2025	42	f
43	13	01.02.2025	49.2	f
44	13	01.01.2025	44.8	f
45	13	01.03.2026	53.9	f
46	14	01.04.2025	1.6	f
47	14	01.02.2025	2.3	f
48	14	01.01.2025	3	f
49	14	01.03.2026	1.3	f
50	15	01.04.2025	0.7	f
51	15	01.02.2025	0.9	f
52	15	01.01.2025	0.5	f
53	15	01.03.2026	0.5	f
54	16	01.04.2025	9.2	f
55	16	01.02.2025	10.8	f
56	16	01.01.2025	10.5	f
57	16	01.03.2026	9.3	f
58	17	01.04.2025	46.5	f
59	17	01.02.2025	36.8	f
60	17	01.01.2025	41.1	f
61	17	01.03.2026	35	f
62	18	01.04.2025	2	f
63	18	01.02.2025	2	f
64	18	01.01.2025	2	f
65	18	01.03.2026	2	f
66	19	01.04.2025	4.9	f
67	19	01.02.2025	5.74	f
68	19	01.01.2025	5.5	f
69	19	01.03.2026	5.5	f
70	20	01.04.2025	5.1	f
71	20	01.02.2025	5.28	f
72	20	01.01.2025	5	f
73	20	01.03.2026	5	f
74	21	01.04.2025	2.4	f
75	21	01.02.2025	34.82	f
76	21	01.01.2025	5.4	f
77	21	01.03.2026	3.4	f
78	22	01.02.2025	8.883	f
79	23	01.03.2026	4.9	f
80	24	01.04.2025	75	f
81	24	01.01.2025	70	f
82	24	01.03.2026	72	f
83	25	01.04.2025	49	f
84	25	01.01.2025	46	f
85	26	01.04.2025	3.39	f
86	26	01.01.2025	3.96	f
87	26	01.03.2026	3.67	f
88	27	01.04.2025	0.93	f
89	27	01.01.2025	1.04	f
90	27	01.03.2026	1.13	f
91	28	01.04.2025	2.12	f
92	28	01.01.2025	2.29	f
93	28	01.03.2026	2.18	f
94	30	01.04.2025	2.46	f
95	30	01.01.2025	2.92	f
96	30	01.03.2026	2.54	f
97	31	01.04.2025	2.6	f
98	31	01.01.2025	2.8	f
99	31	01.03.2026	2.2	f
100	32	01.04.2025	0.75	f
101	32	01.01.2025	1.39	f
102	32	01.03.2026	0.79	f
103	33	01.04.2025	39	f
104	33	01.01.2025	34	f
105	33	01.03.2026	38	f
106	34	01.04.2025	40	f
107	34	01.01.2025	34	f
108	34	01.03.2026	52	f
109	35	01.03.2026	30	f
110	36	01.04.2025	581	f
111	36	01.02.2025	625	f
112	36	01.01.2025	517	f
113	36	01.03.2026	559	f
114	37	01.03.2026	6.9	f
115	38	01.03.2026	113	f
116	39	01.03.2026	45	f
117	40	01.04.2025	889	f
118	40	01.01.2025	1151	f
119	41	01.01.2025	14.4	f
120	42	01.03.2026	47	f
121	43	01.03.2026	13.7	f
122	44	01.03.2026	8.4	f
123	45	01.03.2026	5.3	f
124	47	01.12.2024	96.73	f
125	48	01.12.2024	6.08	f
126	49	01.12.2024	83.2	f
127	55	01.03.2026	3.317	f
128	56	01.03.2026	54.48	f
129	60	01.03.2026	4.43	f
130	61	01.04.2025	47	f
131	61	01.01.2025	31	f
132	61	01.03.2026	64	f
133	62	01.03.2026	11.1	f
134	63	01.03.2026	429	f
135	65	01.04.2025	163	f
136	65	01.01.2025	97	f
137	65	01.03.2026	129	f
138	66	01.03.2026	30.8	f
139	68	01.04.2025	2.78	f
140	68	01.01.2025	2.94	f
141	74	01.03.2026	1.02912	f
142	79	01.03.2026	1.16	f
143	80	01.03.2026	4.9	f
144	81	01.03.2026	11.94	f
145	82	01.03.2026	3	f
146	84	01.03.2026	272.7	f
147	89	01.04.2025	2.6	f
148	89	01.01.2025	7.6	f
149	90	01.03.2026	9.15	f
150	91	01.01.2025	0.065	f
151	95	01.03.2026	16.68	f
152	96	01.03.2026	21.4	f
153	97	01.03.2026	63.7	f
154	98	01.03.2026	26.2	f
155	99	01.03.2026	105	f
156	100	01.03.2026	1.96	f
157	101	01.03.2026	97	f
158	103	01.03.2026	0.457	f
159	104	17.12.2025	139	f
160	105	17.12.2025	4.6	f
161	106	17.12.2025	90.3	f
162	107	17.12.2025	30.3	f
163	108	17.12.2025	335	f
164	109	17.12.2025	12.5	f
165	110	17.12.2025	41.5	f
166	111	17.12.2025	303	f
167	115	17.12.2025	4.85	f
168	116	17.12.2025	47	f
169	117	17.12.2025	3.8	f
170	118	17.12.2025	0.9	f
171	119	17.12.2025	9.5	f
172	120	17.12.2025	38.8	f
173	121	17.12.2025	6	f
174	123	17.12.2025	4.9	f
175	124	17.12.2025	5.4	f
176	126	17.12.2025	70	f
177	128	17.12.2025	4.96	f
178	129	17.12.2025	2.29	f
179	130	17.12.2025	2.27	f
180	132	17.12.2025	2.67	f
181	133	17.12.2025	1.17	f
182	134	17.12.2025	0.87	f
183	135	17.12.2025	11	f
184	136	17.12.2025	14	f
185	137	17.12.2025	19	f
186	138	17.12.2025	181	f
187	139	17.12.2025	3.7	f
188	140	17.12.2025	58	f
189	142	17.12.2025	9.3	f
190	143	17.12.2025	5.5	f
191	144	17.12.2025	3.8	f
192	151	17.12.2025	90.9	f
193	156	17.12.2025	12.8	f
194	157	17.12.2025	36.1	f
195	158	17.12.2025	4.8	f
196	159	17.12.2025	320	f
197	161	17.12.2025	32	f
198	162	17.12.2025	18.33	f
199	164	17.12.2025	3.36	f
200	165	17.12.2025	21.7	f
201	176	17.12.2025	2.1	f
202	177	17.12.2025	4.82	f
203	178	17.12.2025	13.71	f
204	179	17.12.2025	3	f
205	180	17.12.2025	3	f
206	186	17.12.2025	9.62	f
207	196	28.09.2024	150	f
208	196	16.10.2024	136	f
209	196	07.01.2024	130	f
210	196	19.03.2025	142	f
211	196	04.10.2025	124	f
212	196	30.12.2025	144	f
213	197	28.09.2024	4.87	f
214	197	16.10.2024	4.68	f
215	197	07.01.2024	4.41	f
216	197	19.03.2025	4.73	f
217	197	04.10.2025	4.06	f
218	197	30.12.2025	4.69	f
219	198	28.09.2024	90.2	f
220	198	16.10.2024	89.5	f
221	198	07.01.2024	90.7	f
222	198	19.03.2025	90.9	f
223	198	04.10.2025	82.3	f
224	198	30.12.2025	91.2	f
225	199	28.09.2024	30.7	f
226	199	16.10.2024	29.1	f
227	199	07.01.2024	29.5	f
228	199	19.03.2025	30	f
229	199	04.10.2025	30.5	f
230	199	30.12.2025	30.7	f
231	200	28.09.2024	342	f
232	200	16.10.2024	325	f
233	200	07.01.2024	325	f
234	200	19.03.2025	330	f
235	200	04.10.2025	346	f
236	200	30.12.2025	337	f
237	201	28.09.2024	42.5	f
238	201	16.10.2024	41.1	f
239	201	07.01.2024	40	f
240	201	19.03.2025	42.4	f
241	201	04.10.2025	39.3	f
242	201	30.12.2025	45.1	f
243	202	28.09.2024	13	f
244	202	16.10.2024	12.5	f
245	202	07.01.2024	12.7	f
246	202	30.12.2025	13.2	f
247	203	28.09.2024	43.9	f
248	203	16.10.2024	41.9	f
249	203	19.03.2025	43	f
250	203	04.10.2025	33.4	f
251	203	30.12.2025	42.7	f
252	204	28.09.2024	263	f
253	204	16.10.2024	228	f
254	204	07.01.2024	239	f
255	204	19.03.2025	257	f
256	204	04.10.2025	175	f
257	204	30.12.2025	288	f
258	205	28.09.2024	11.2	f
259	205	16.10.2024	12	f
260	205	07.01.2024	12.4	f
261	205	19.03.2025	11.5	f
262	205	04.10.2025	12.3	f
263	205	30.12.2025	11.9	f
264	206	16.10.2024	0.27	f
265	206	19.03.2025	0.3	f
266	206	04.10.2025	0.22	f
267	206	30.12.2025	0.342	f
268	207	28.09.2024	16.1	f
269	207	16.10.2024	15.6	f
270	207	07.01.2024	16	f
271	207	19.03.2025	14.5	f
272	207	04.10.2025	14.8	f
273	208	28.09.2024	6.36	f
274	208	16.10.2024	5.87	f
275	208	07.01.2024	5.73	f
276	208	19.03.2025	7.68	f
277	208	04.10.2025	4.76	f
278	208	30.12.2025	5.91	f
279	209	28.09.2024	49	f
280	209	16.10.2024	44.5	f
281	209	07.01.2024	47.3	f
282	209	19.03.2025	42.8	f
283	209	04.10.2025	42	f
284	209	30.12.2025	45.9	f
285	210	28.09.2024	3.8	f
286	210	16.10.2024	4.3	f
287	210	07.01.2024	4.1	f
288	210	19.03.2025	4.7	f
289	210	04.10.2025	6	f
290	210	30.12.2025	5.1	f
291	211	28.09.2024	0.5	f
292	211	16.10.2024	1	f
293	211	07.01.2024	0.7	f
294	211	19.03.2025	0.7	f
295	211	04.10.2025	1	f
296	211	30.12.2025	0.7	f
297	212	28.09.2024	8	f
298	212	16.10.2024	9.5	f
299	212	07.01.2024	6.3	f
300	212	19.03.2025	9.4	f
301	212	04.10.2025	8	f
302	212	30.12.2025	7	f
303	213	28.09.2024	39.3	f
304	213	16.10.2024	40.7	f
305	213	07.01.2024	41.6	f
306	213	19.03.2025	42.4	f
307	213	04.10.2025	42	f
308	213	30.12.2025	41.3	f
309	214	16.10.2024	2	f
310	214	19.03.2025	5	f
311	214	04.10.2025	2	f
312	214	30.12.2025	5	f
313	215	28.09.2024	4.16	f
314	215	30.12.2025	5.02	f
315	216	07.01.2024	5.2	f
316	216	04.10.2025	5.6	f
317	217	16.10.2024	1.1	f
318	217	19.03.2025	7.3	f
319	217	04.10.2025	5.8	f
320	219	04.10.2025	2	f
321	220	04.10.2025	1.91	f
322	221	04.10.2025	221.61	f
323	222	04.10.2025	1.7	f
324	223	28.09.2024	72.9	f
325	223	07.01.2024	71	f
326	223	19.03.2025	69.24	f
327	223	04.10.2025	71.8	f
328	223	30.12.2025	72.72	f
329	224	07.01.2024	40	f
330	224	19.03.2025	62.66	f
331	225	16.10.2024	4.52	f
332	225	07.01.2024	4.654	f
333	225	19.03.2025	4.24	f
334	225	04.10.2025	3.94	f
335	226	16.10.2024	1.11	f
336	226	07.01.2024	1.3	f
337	226	19.03.2025	1.57	f
338	226	04.10.2025	1.13	f
339	227	16.10.2024	2.94	f
340	227	07.01.2024	3	f
341	227	19.03.2025	2.32	f
342	227	04.10.2025	2.51	f
343	228	16.10.2024	3.41	f
344	228	07.01.2024	3.35	f
345	228	19.03.2025	2.67	f
346	229	19.03.2025	0.35	f
347	230	16.10.2024	3.07	f
348	230	07.01.2024	2.5	f
349	230	19.03.2025	1.7	f
350	231	16.10.2024	0.66	f
351	231	07.01.2024	1.5	f
352	231	19.03.2025	0.76	f
353	231	04.10.2025	0.58	f
354	232	28.09.2024	22.4	f
355	232	07.01.2024	26	f
356	232	04.10.2025	13	f
357	232	30.12.2025	20.64	f
358	233	28.09.2024	30.3	f
359	233	07.01.2024	30	f
360	233	04.10.2025	16	f
361	233	30.12.2025	19.23	f
362	234	16.10.2024	11	f
363	234	07.01.2024	29	f
364	234	04.10.2025	14	f
365	234	30.12.2025	23.52	f
366	235	16.10.2024	464	f
367	235	07.01.2024	446	f
368	235	19.03.2025	396	f
369	235	04.10.2025	497	f
370	236	28.09.2024	4.5	f
371	236	07.01.2024	7.78	f
372	236	19.03.2025	3.9	f
373	236	04.10.2025	6	f
374	236	30.12.2025	7.96	f
375	237	28.09.2024	105	f
376	237	07.01.2024	82.2	f
377	237	04.10.2025	88.9	f
378	237	30.12.2025	99.27	f
379	238	16.10.2024	50.9	f
380	238	07.01.2024	71	f
381	238	04.10.2025	57	f
382	238	30.12.2025	62.89	f
383	239	28.09.2024	22.9	f
384	239	16.10.2024	19.5	f
385	239	07.01.2024	13.68	f
386	239	19.03.2025	14.1	f
387	239	04.10.2025	13.9	f
388	239	30.12.2025	23.28	f
389	240	16.10.2024	13	f
390	240	07.01.2024	6.84	f
391	240	19.03.2025	7.7	f
392	240	04.10.2025	11	f
393	240	30.12.2025	16.42	f
394	241	16.10.2024	6.5	f
395	241	07.01.2024	6.84	f
396	241	19.03.2025	6.4	f
397	241	04.10.2025	2.9	f
398	241	30.12.2025	6.86	f
399	242	16.10.2024	117.28	f
400	242	04.10.2025	13.2	f
401	243	04.10.2025	14.8	f
402	244	04.10.2025	14.7	f
403	245	19.03.2025	50000	f
404	246	16.10.2024	60.8	f
405	246	19.03.2025	18.2	f
406	246	04.10.2025	33.1	f
407	247	16.10.2024	42.1	f
408	247	07.01.2024	40.55	f
409	247	19.03.2025	61.1	f
410	247	04.10.2025	45	f
411	248	04.10.2025	10.3	f
412	249	16.10.2024	7.6	f
413	249	19.03.2025	19.6	f
414	249	04.10.2025	11.5	f
415	250	16.10.2024	552	f
416	250	07.01.2024	571	f
417	250	04.10.2025	179.4	f
418	251	16.10.2024	309	f
419	251	07.01.2024	250	f
420	251	19.03.2025	160	f
421	251	04.10.2025	125.9	f
422	252	07.01.2024	87	f
423	254	16.10.2024	2.06	f
424	254	07.01.2024	29	f
425	255	04.10.2025	29.2	f
426	256	07.01.2024	107	f
427	256	30.12.2025	101	f
428	257	16.10.2024	16	f
429	257	04.10.2025	12.5	f
430	258	16.10.2024	2753	f
431	258	07.01.2024	142	f
432	258	30.12.2025	143	f
433	259	19.03.2025	0.134	f
434	259	04.10.2025	105.6	f
435	260	19.03.2025	0.064	f
436	260	04.10.2025	98.939	f
437	261	16.10.2024	2.04	f
438	261	07.01.2024	3.35	f
439	261	19.03.2025	3.99	f
440	261	04.10.2025	1.6	f
441	262	16.10.2024	2.69	f
442	262	07.01.2024	0.9	f
443	262	19.03.2025	3.55	f
444	262	04.10.2025	4.27	f
445	263	16.10.2024	1.57	f
446	263	07.01.2024	7.11	f
447	263	19.03.2025	1.34	f
448	263	04.10.2025	15.31	f
449	264	16.10.2024	10.4	f
450	264	04.10.2025	1.38	f
451	265	16.10.2024	17.4	f
452	265	04.10.2025	0.9	f
453	266	16.10.2024	10.6	f
454	267	19.03.2025	1.72	f
455	268	16.10.2024	402	f
456	270	16.10.2024	0.3	f
457	270	04.10.2025	0.33	f
458	271	16.10.2024	12.4	f
459	271	19.03.2025	8.7	f
460	271	04.10.2025	11.6	f
461	272	16.10.2024	2.5	f
462	273	16.10.2024	205	f
463	273	19.03.2025	202	f
464	273	04.10.2025	122.4	f
465	274	16.10.2024	30	f
466	275	04.10.2025	8.2	f
467	276	04.10.2025	4	f
468	277	04.10.2025	0.82	f
469	278	04.10.2025	1.41	f
470	279	07.01.2024	112	f
471	280	16.10.2024	48	f
472	280	19.03.2025	68	f
473	281	16.10.2024	23.82	f
474	282	16.10.2024	12.8	f
475	282	19.03.2025	10.9	f
476	282	04.10.2025	188.5	f
477	282	30.12.2025	109	f
478	283	16.10.2024	3.43	f
479	284	16.10.2024	3.2	f
480	285	16.10.2024	19.2	f
481	286	04.10.2025	649.7	f
482	287	30.12.2025	1	f
628	321	15.11.2025	19	f
483	292	31.03.2026		f
484	292	05.03.2026		f
485	292	20.01.2026		f
486	292	06.01.2026		f
487	292	15.11.2025		f
488	293	31.03.2026		f
489	293	05.03.2026		f
490	293	20.01.2026		f
491	293	06.01.2026		f
492	293	15.11.2025		f
493	294	31.03.2026		f
494	294	05.03.2026		f
495	294	20.01.2026		f
496	294	06.01.2026		f
497	294	15.11.2025		f
498	295	31.03.2026		f
499	295	05.03.2026		f
500	295	20.01.2026		f
501	295	06.01.2026		f
502	295	15.11.2025		f
503	296	31.03.2026		f
504	296	05.03.2026		f
505	296	20.01.2026		f
506	296	06.01.2026		f
507	296	15.11.2025		f
508	297	31.03.2026		f
509	297	05.03.2026		f
510	297	20.01.2026		f
511	297	06.01.2026		f
512	297	15.11.2025		f
513	298	31.03.2026		f
514	298	05.03.2026		f
515	298	20.01.2026		f
516	298	06.01.2026		f
517	298	15.11.2025		f
518	299	31.03.2026		f
519	299	05.03.2026		f
520	299	20.01.2026		f
521	299	06.01.2026		f
522	299	15.11.2025		f
523	300	31.03.2026		f
524	300	05.03.2026		f
525	300	20.01.2026		f
526	300	06.01.2026		f
527	300	15.11.2025		f
528	301	31.03.2026		f
529	301	05.03.2026		f
530	301	20.01.2026		f
531	301	06.01.2026		f
532	301	15.11.2025		f
533	302	31.03.2026		f
534	302	05.03.2026		f
535	302	20.01.2026		f
536	302	06.01.2026		f
537	302	15.11.2025		f
538	303	31.03.2026		f
539	303	05.03.2026		f
540	303	20.01.2026		f
541	303	06.01.2026		f
542	303	15.11.2025		f
543	304	31.03.2026		f
544	304	05.03.2026		f
545	304	20.01.2026		f
546	304	06.01.2026		f
547	304	15.11.2025		f
548	305	31.03.2026		f
549	305	05.03.2026		f
550	305	20.01.2026		f
551	305	06.01.2026		f
552	305	15.11.2025		f
553	306	31.03.2026		f
554	306	05.03.2026		f
555	306	20.01.2026		f
556	306	06.01.2026		f
557	306	15.11.2025		f
558	307	31.03.2026		f
559	307	05.03.2026		f
560	307	20.01.2026		f
561	307	06.01.2026		f
562	307	15.11.2025		f
563	308	31.03.2026		f
564	308	05.03.2026		f
565	308	20.01.2026		f
566	308	06.01.2026		f
567	308	15.11.2025		f
568	309	31.03.2026		f
569	309	05.03.2026		f
570	309	20.01.2026		f
571	309	06.01.2026		f
572	309	15.11.2025		f
573	310	15.11.2025	5.8	f
574	310	20.01.2026	5.4	f
575	310	05.03.2026	5.2	f
576	310	06.01.2026		f
577	310	31.03.2026		f
578	311	15.11.2025	5.7	f
579	311	20.01.2026	5.5	f
580	311	05.03.2026	5.4	f
581	311	06.01.2026		f
582	311	31.03.2026		f
583	312	15.11.2025	18.4	f
584	312	20.01.2026	14.1	f
585	312	05.03.2026	11.9	f
586	312	06.01.2026		f
587	312	31.03.2026		f
588	313	15.11.2025	4.7	f
589	313	20.01.2026	3.4	f
590	313	05.03.2026	2.8	f
591	313	06.01.2026		f
592	313	31.03.2026		f
593	314	15.11.2025	6.1	f
594	314	20.01.2026	5.7	f
595	314	05.03.2026	5.4	f
596	314	06.01.2026		f
597	314	31.03.2026		f
598	315	15.11.2025	4	f
599	315	20.01.2026	3.5	f
600	315	05.03.2026	3.2	f
601	315	06.01.2026		f
602	315	31.03.2026		f
603	316	15.11.2025	1	f
604	316	20.01.2026	1.1	f
605	316	05.03.2026	1.2	f
606	316	06.01.2026		f
607	316	31.03.2026		f
608	317	15.11.2025	2.1	f
609	317	20.01.2026	1.8	f
610	317	05.03.2026	1.6	f
611	317	06.01.2026		f
612	317	31.03.2026		f
613	318	15.11.2025	46	f
614	318	20.01.2026	38	f
615	318	05.03.2026	34	f
616	318	06.01.2026		f
617	318	31.03.2026		f
618	319	15.11.2025	39	f
619	319	20.01.2026	33	f
620	319	05.03.2026	29	f
621	319	06.01.2026		f
622	319	31.03.2026		f
623	320	15.11.2025	66	f
624	320	20.01.2026	58	f
625	320	05.03.2026	49	f
626	320	06.01.2026		f
627	320	31.03.2026		f
629	321	20.01.2026	17	f
630	321	05.03.2026	16	f
631	321	06.01.2026		f
632	321	31.03.2026		f
633	322	15.11.2025	4.7	f
634	322	20.01.2026	4.2	f
635	322	05.03.2026	3.8	f
636	322	06.01.2026		f
637	322	31.03.2026		f
638	323	15.11.2025	14.3	f
639	323	20.01.2026	12.8	f
640	323	05.03.2026	12.2	f
641	323	06.01.2026		f
642	323	31.03.2026		f
643	324	15.11.2025	61	f
644	324	20.01.2026	54	f
645	324	05.03.2026	48	f
646	324	06.01.2026		f
647	324	31.03.2026		f
648	325	15.11.2025	180	f
649	325	20.01.2026	195	f
650	325	05.03.2026	215	f
651	325	06.01.2026		f
652	325	31.03.2026		f
653	326	15.11.2025	122	f
654	326	20.01.2026	109	f
655	326	05.03.2026	94	f
656	326	06.01.2026		f
657	326	31.03.2026		f
658	327	15.11.2025	21.4	f
659	327	20.01.2026	18.7	f
660	327	05.03.2026	16.9	f
661	327	06.01.2026		f
662	327	31.03.2026		f
663	328	15.11.2025	310	f
664	328	20.01.2026	265	f
665	328	05.03.2026	228	f
666	328	06.01.2026		f
667	328	31.03.2026		f
668	329	15.11.2025	6.2	f
669	329	20.01.2026	5.5	f
670	329	05.03.2026	5.1	f
671	329	06.01.2026		f
672	329	31.03.2026		f
673	330	15.11.2025	42	f
674	330	20.01.2026	31	f
675	330	05.03.2026	24	f
676	330	06.01.2026		f
677	330	31.03.2026		f
678	331	15.11.2025	14.8	f
679	331	20.01.2026	13.2	f
680	331	05.03.2026	11.9	f
681	331	06.01.2026		f
682	331	31.03.2026		f
683	332	15.11.2025	12.4	f
684	332	20.01.2026	11.2	f
685	332	05.03.2026	10.1	f
686	332	06.01.2026		f
687	332	31.03.2026		f
688	333	15.11.2025	0.73	f
689	333	20.01.2026	0.69	f
690	333	05.03.2026	0.64	f
691	333	06.01.2026		f
692	333	31.03.2026		f
693	334	15.11.2025	3.8	f
694	334	20.01.2026	3.3	f
695	334	05.03.2026	2.9	f
696	334	06.01.2026		f
697	334	31.03.2026		f
698	335	15.11.2025	4.2	f
699	335	20.01.2026	4.4	f
700	335	05.03.2026	4.7	f
701	335	06.01.2026		f
702	335	31.03.2026		f
703	336	15.11.2025	13.2	f
704	336	20.01.2026	13.8	f
705	336	05.03.2026	14.5	f
706	336	06.01.2026		f
707	336	31.03.2026		f
708	337	15.11.2025	238	f
709	337	20.01.2026	212	f
710	337	05.03.2026	185	f
711	337	06.01.2026		f
712	337	31.03.2026		f
713	338	15.11.2025	612	f
714	338	20.01.2026	655	f
715	338	05.03.2026	20	t
716	338	06.01.2026		f
717	338	31.03.2026		f
718	339	15.11.2025	260	f
719	339	20.01.2026	292	f
720	339	05.03.2026	338	f
721	339	06.01.2026		f
722	339	31.03.2026		f
723	340	15.11.2025	7.1	f
724	340	20.01.2026	6.2	f
725	340	05.03.2026	5.4	f
726	340	06.01.2026		f
727	340	31.03.2026		f
728	341	15.11.2025	295	f
729	341	20.01.2026	311	f
730	341	05.03.2026	328	f
731	341	06.01.2026		f
732	341	31.03.2026		f
733	342	15.11.2025	4.8	f
734	342	20.01.2026	5.6	f
735	342	05.03.2026	6.4	f
736	342	06.01.2026		f
737	342	31.03.2026		f
738	343	15.11.2025	13.1	f
739	343	20.01.2026	14.4	f
740	343	05.03.2026	15.8	f
741	343	06.01.2026		f
742	343	31.03.2026		f
743	344	15.11.2025	118	f
744	344	20.01.2026	126	f
745	344	05.03.2026	134	f
746	344	06.01.2026		f
747	344	31.03.2026		f
748	345	05.03.2026		f
749	345	20.01.2026		f
750	345	06.01.2026		f
751	345	15.11.2025		f
752	345	31.03.2026		f
753	346	15.11.2025	9	f
754	346	20.01.2026	10	f
755	346	05.03.2026	11	f
756	346	06.01.2026		f
757	346	31.03.2026		f
758	347	15.11.2025	176	f
759	347	20.01.2026	192	f
760	347	05.03.2026	214	f
761	347	06.01.2026		f
762	347	31.03.2026		f
763	348	15.11.2025	102	f
764	348	20.01.2026	98	f
765	348	05.03.2026	94	f
766	348	06.01.2026		f
767	348	31.03.2026		f
768	349	15.11.2025	6.8	f
769	349	20.01.2026	6.2	f
770	349	05.03.2026	5.7	f
771	349	06.01.2026		f
772	349	31.03.2026		f
773	350	15.11.2025	412	f
774	350	20.01.2026	395	f
775	350	05.03.2026	372	f
776	350	06.01.2026		f
777	350	31.03.2026		f
778	351	15.11.2025	126	f
779	351	20.01.2026	119	f
780	351	05.03.2026	109	f
781	351	06.01.2026		f
782	351	31.03.2026		f
783	352	15.11.2025	58	f
784	352	20.01.2026	54	f
785	352	05.03.2026	49	f
786	352	06.01.2026		f
787	352	31.03.2026		f
788	353	15.11.2025	41	f
789	353	20.01.2026	46	f
790	353	05.03.2026	52	f
791	353	06.01.2026		f
792	353	31.03.2026		f
793	354	15.11.2025	13.9	f
794	354	20.01.2026	12.6	f
795	354	05.03.2026	11.2	f
796	354	06.01.2026		f
797	354	31.03.2026		f
798	355	15.11.2025	9.8	f
799	355	20.01.2026	8.6	f
800	355	05.03.2026	7.4	f
801	355	06.01.2026		f
802	355	31.03.2026		f
803	356	15.11.2025	5.8	f
804	356	20.01.2026	5.1	f
805	356	05.03.2026	4.7	f
806	356	06.01.2026		f
807	356	31.03.2026		f
808	357	15.11.2025	6.2	f
809	357	20.01.2026	6.7	f
810	357	05.03.2026	7.1	f
811	357	06.01.2026		f
812	357	31.03.2026		f
813	358	15.11.2025	0.36	f
814	358	20.01.2026	0.41	f
815	358	05.03.2026	0.45	f
816	358	06.01.2026		f
817	358	31.03.2026		f
818	359	15.11.2025	1.2	f
819	359	20.01.2026	1.3	f
820	359	05.03.2026	1.4	f
821	359	06.01.2026		f
822	359	31.03.2026		f
823	360	15.11.2025	1.2	f
824	360	20.01.2026	1.1	f
825	360	05.03.2026	1	f
826	360	06.01.2026		f
827	360	31.03.2026		f
828	361	15.11.2025	35	f
829	361	20.01.2026	35	f
830	361	05.03.2026	35	f
831	361	06.01.2026		f
832	361	31.03.2026		f
833	362	15.11.2025	45	f
834	362	20.01.2026	45	f
835	362	05.03.2026	45	f
836	362	06.01.2026		f
837	362	31.03.2026		f
\.


--
-- Data for Name: client_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.client_assignments (id, user_id, client_id, assigned_by) FROM stdin;
1	4	c-1773270983915	1
2	4	c-1774621684239	1
3	5	c-1773270983915	1
4	5	c-1774621510596	1
5	5	c-1774621590636	1
\.


--
-- Data for Name: clients; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clients (id, name, short_name, dob, age, sex, avatar, color) FROM stdin;
c-1774621590636	Кондрашов Александр Сергеевич	Александр Кондрашов		0	Мужской	АК	hsl(40.18141547931744,55%,55%)
c-1774621684239	Ручьева Татьяна Николаевна	Татьяна Ручьёва		0	Женский	ТР	hsl(238.8700669423443,55%,55%)
c-1774621510596	Василенко Антон Николаевич	Антон Василенко		0	Мужской	АВ	hsl(35.29343305120893,55%,55%)
c-1773270983915	Иванов Иван	Иванов Иван	14.09.1989	36	Мужской	ИИ	hsl(210,55%,55%)
\.


--
-- Data for Name: doctors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.doctors (id, name, role, user_id) FROM stdin;
1	Ульяна	Эндокринолог	4
2	Инна	Нутрициолог	5
3	Юлия	Эксперт-нутрициолог	\N
\.


--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.journal_entries (id, client_id, stage_id, entry_num, date, type, text, author) FROM stdin;
41	c-1773270983915	20	0	06.03.2026	Старт	Первичный разбор анализов, сформированы цели и стартовый протокол.	2life
42	c-1773270983915	20	1	07.03.2026	Консультация	Обсудили питание, внедрили базовый режим 3 приемов пищи.	Волкова Наталья
43	c-1773270983915	20	2	09.03.2026	Созвон	Больше энергии утром, но сохраняется позднее засыпание.	Волкова Наталья
44	c-1773270983915	20	3	10.03.2026	Заметка	Подтверждены дефициты: Vit D, ферритин, B12, магний.	2life
45	c-1773270983915	20	4	11.03.2026	Обследование	Выполнена корректировка протокола, добавлен берберин.	2life
\.


--
-- Data for Name: nutrition_revisions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.nutrition_revisions (id, stage_id, revision_num, date, label, comment, data_json) FROM stdin;
1	1	1		Стартовый		{"generalRules":[],"categories":[],"instructions":[]}
2	2	1		Стартовый		{"generalRules":[],"categories":[],"instructions":[]}
3	3	1		Стартовый		{"generalRules":[],"categories":[],"instructions":[]}
28	20	1	06.03.2026	Стартовый	Тут врач может оставлять комментарии к текущему этапу. \n	{"generalRules":[{"title":"Режим","desc":"3 основных приема пищи, ужин не позднее 20:00."},{"title":"Белок","desc":"Не менее 1.6 г/кг целевой массы ежедневно."},{"title":"Клетчатка","desc":"25-35 г/сутки за счёт овощей, зелени и ягод."},{"title":"Вода","desc":"2.2-2.5 л/сутки равномерно в течение дня."}],"categories":[{"name":"Основа рациона","products":"рыба, яйца, индейка, овощи, бобовые","instruction":"на каждый прием пищи","notes":"приоритет цельным продуктам"},{"name":"Ограничить","products":"сахар, выпечка, сладкие напитки, фастфуд","instruction":"максимум 1 порция/нед","notes":"контроль тяги к сладкому"},{"name":"Полезные жиры","products":"оливковое масло, авокадо, орехи","instruction":"ежедневно 1-2 порции","notes":"без перегрева масел"},{"name":"Ужин","products":"белок + овощи","instruction":"без быстрых углеводов","notes":"улучшение сна и гликемии"}],"instructions":[{"text":"Тарелка здорового питания (50/25/25)","url":"https://example.com/plate"},{"text":"Гид по продуктам с низкой гликемической нагрузкой","url":"https://example.com/low-glycemic"},{"text":"Чек-лист вечернего режима для сна","url":"https://example.com/sleep-checklist"}]}
29	20	2	12.03.2026	Корректировка 2		{"generalRules":[{"title":"Режим","desc":"3 основных приема пищи, ужин не позднее 20:00."},{"title":"Белок","desc":"Не менее 1.6 г/кг целевой массы ежедневно."},{"title":"Клетчатка","desc":"25-35 г/сутки за счёт овощей, зелени и ягод."},{"title":"Вода","desc":"2.2-2.5 л/сутки равномерно в течение дня."}],"categories":[{"name":"Основа рациона","products":"рыба, яйца, индейка, овощи, бобовые","instruction":"на каждый прием пищи","notes":"приоритет цельным продуктам"},{"name":"Ограничить","products":"сахар, выпечка, сладкие напитки, фастфуд","instruction":"максимум 1 порция/нед","notes":"контроль тяги к сладкому"},{"name":"Полезные жиры","products":"оливковое масло, авокадо, орехи","instruction":"ежедневно 1-2 порции","notes":"без перегрева масел"},{"name":"Ужин","products":"белок + овощи","instruction":"без быстрых углеводов","notes":"улучшение сна и гликемии"}],"instructions":[{"text":"Тарелка здорового питания (50/25/25)","url":"https://example.com/plate"},{"text":"Гид по продуктам с низкой гликемической нагрузкой","url":"https://example.com/low-glycemic"},{"text":"Чек-лист вечернего режима для сна","url":"https://example.com/sleep-checklist"}]}
30	21	1	27.03.2026	Стартовый		{"generalRules":[],"categories":[],"instructions":[]}
\.


--
-- Data for Name: protocol_revisions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.protocol_revisions (id, stage_id, revision_num, date, label, groups_json) FROM stdin;
1	1	1		Стартовый	[]
2	2	1		Стартовый	[]
3	3	1		Стартовый	[]
28	20	1	06.03.2026	Стартовый	[{"name":"Утро","items":[{"name":"Vitamin D3 + K2","dose":"5000 МЕ","timing":"после завтрака","goal":"Коррекция дефицита витамина D","days":90,"packs":2,"link":"https://example.com/vitamin-d3-k2","slot":"morning","order":1},{"name":"Omega-3 (EPA/DHA)","dose":"2000 мг","timing":"во время еды","goal":"Снижение воспаления","days":90,"packs":3,"link":"https://example.com/omega-3","slot":"morning","order":1}]},{"name":"День","items":[{"name":"Магний малат","dose":"400 мг","timing":"после обеда","goal":"Энергия","days":90,"packs":3,"link":"https://example.com/magnesium-malate","slot":"day","order":1}]},{"name":"Вечер","items":[{"name":"Магний глицинат","dose":"300 мг","timing":"за 1-2 ч до сна","goal":"Качество сна","days":90,"packs":3,"link":"https://example.com/magnesium-glycinate","slot":"evening","order":1}]},{"name":"На ночь","items":[{"name":"Глицин","dose":"1000 мг","timing":"за 30 минут до сна","goal":"Засыпание","days":30,"packs":1,"link":"https://example.com/glycine","slot":"night","order":1}]},{"name":"До тренировки","items":[{"name":"L-карнитин","dose":"1500 мг","timing":"за 30 мин до тренировки","goal":"Выносливость","days":60,"packs":2,"link":"https://example.com/l-carnitine","slot":"custom-prework","order":2}]},{"name":"Во время еды","items":[{"name":"Витамин Д ","dose":"1 капсула","timing":"Вместе с едой ","goal":"пываы","days":30,"packs":1,"link":"","slot":"custom-1774267112987","order":0}]}]
29	20	2	31.03.2026	Корректировка 2	[{"name":"Утро","items":[{"name":"Vitamin D3 + K2","dose":"5000 МЕ","timing":"после завтрака","goal":"Коррекция дефицита витамина D","days":90,"packs":2,"link":"https://example.com/vitamin-d3-k2","slot":"morning","order":1},{"name":"Omega-3 (EPA/DHA)","dose":"2000 мг","timing":"во время еды","goal":"Снижение воспаления","days":90,"packs":3,"link":"https://example.com/omega-3","slot":"morning","order":1}]},{"name":"День","items":[{"name":"Магний малат","dose":"400 мг","timing":"после обеда","goal":"Энергия","days":90,"packs":3,"link":"https://example.com/magnesium-malate","slot":"day","order":1}]},{"name":"Вечер","items":[{"name":"Магний глицинат","dose":"300 мг","timing":"за 1-2 ч до сна","goal":"Качество сна","days":90,"packs":3,"link":"https://example.com/magnesium-glycinate","slot":"evening","order":1}]},{"name":"На ночь","items":[{"name":"Глицин","dose":"1000 мг","timing":"за 30 минут до сна","goal":"Засыпание","days":30,"packs":1,"link":"https://example.com/glycine","slot":"night","order":1}]},{"name":"До тренировки","items":[{"name":"L-карнитин","dose":"1500 мг","timing":"за 30 мин до тренировки","goal":"Выносливость","days":60,"packs":2,"link":"https://example.com/l-carnitine","slot":"custom-prework","order":2}]},{"name":"Во время еды","items":[{"name":"Витамин Д ","dose":"1 капсула","timing":"Вместе с едой ","goal":"пываы","days":30,"packs":1,"link":"","slot":"custom-1774267112987","order":0}]}]
30	21	1		Стартовый	[]
\.


--
-- Data for Name: reference_data; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reference_data (id, type, value, sort_order, active) FROM stdin;
1	deficit_preset	{"id":"iron","label":"Железодефицит","markerKey":"нутриенты::ферритин","triggerMode":"auto","priority":100}	0	t
2	deficit_preset	{"id":"vitd","label":"Дефицит витамина D","markerKey":"нутриенты::витамин д","triggerMode":"auto","priority":95}	1	t
3	deficit_preset	{"id":"b12","label":"Дефицит B12","markerKey":"нутриенты::в12 (голотранскобаламин)","triggerMode":"auto","priority":90}	2	t
4	deficit_preset	{"id":"folate","label":"Дефицит фолатов","markerKey":"нутриенты::фолиевая кислота в эритроцитах (в9)","triggerMode":"auto","priority":85}	3	t
5	deficit_preset	{"id":"magnesium","label":"Дефицит магния","markerKey":"нутриенты::магний в эритроцитах","triggerMode":"auto","priority":80}	4	t
6	deficit_preset	{"id":"zinc","label":"Дефицит цинка","markerKey":"нутриенты::цинк сыворотка","triggerMode":"auto","priority":75}	5	t
7	deficit_preset	{"id":"selenium","label":"Дефицит селена","markerKey":"нутриенты::селен волосы","triggerMode":"auto","priority":70}	6	t
8	deficit_preset	{"id":"protein","label":"Белковый дефицит","markerKey":"метаболизм::общий белок","triggerMode":"auto","priority":65}	7	t
9	deficit_preset	{"id":"omega3","label":"Дефицит омега-3","markerKey":"эли висцеро тест 24::омега-3 индекс","triggerMode":"auto","priority":60}	8	t
10	lab_order_item	{"name":"Общий анализ крови","markers":["Гемоглобин HGB","Эритроциты RBC","Ср.объем эритроцитов MCV","Среднее содержание Гемо в Эри MCH","Средняя концентрация гемо в эри MCHC","Распределения эритроцитов по объему RDW","Гематокрит HCT","Тромбоциты PLT","Средний объем тромбоцитов MPV","Тромбокрит","Индекс распред тромбоцитов (PDW)","Лейкоциты WBC","Нейтрофилы NE","Эозинофилы EOS","Базофилы BAS","Моноциты MO","Лимфоциты LY","СОЭ"],"simple":true}	0	t
11	lab_order_item	{"name":"Пищеварение","markers":["Билирубин общий","Билирубин непрямой","Билирубин прямой","Эластаза панкреатическая","Панкреатическая амилаза","Пепсиноген 1","Гастрин","Антитела к париетальным клеткам желудка","Хеликобактер, IgG (колич)","IgG на глютен","IgG на казеин","IgG яйцо куриное","IgG к другим продуктам","Антитела к тканевой трансглутаминазе IgA","АТ к эндомизию IgA","Эозинофильно катионный белок (ЭКБ)"],"simple":false}	2	t
12	lab_order_item	{"name":"Метаболизм","markers":["Глюкоза","Гликированный гемоглобин","Инсулин","Индекс Хома","Общий белок","Альбумин","Общий холестерин","ЛПВП","ЛПНП","ЛПОНП","не-ЛПВП","Индекс атерогенности (коэф. атерогенности)","Триглицериды","АЛТ (АЛаТ)","АСТ(АСаТ)","ГГПТ (ГГТ)","Мочевая кислота","Мочевина","Креатинин","Щелочная фосфатаза"],"simple":false}	1	t
13	lab_order_item	{"name":"Энергия","markers":["ТТГ","Т3 свободный","Т4 свободный","Антитела к тиреопероксидазе (АТ-ТПО)","Антитела к тиреглобулину (АТ-ТГ)"],"simple":false}	4	t
14	lab_order_item	{"name":"Нутриенты","markers":["Витамин Д","Фолиевая кислота в эритроцитах (В9)","В12 (голотранскобаламин)","В6","Витамин С (аскорбиновая кислота)","Витамин E (токоферол)","Ферритин","Железо сыв","ЛЖСС","Трансферрин","Магний в эритроцитах","Марганец волосы","Селен волосы","Хром волосы","Алюмилий волосы","Кальций общий","Кальций ионизированный","Цинк сыворотка","Медь сыворотка","Натрий","Хлориды","Калий"],"simple":false}	3	t
15	lab_order_item	{"name":"Иммунитет и воспаление","markers":["СОЭ","С-реативный белок (СРБ)","Гомоцистеин"],"simple":false}	6	t
16	lab_order_item	{"name":"Ревматоидный фактор","markers":["IgE общий"],"simple":false}	7	t
17	lab_order_item	{"name":"Антистрептолизин О (АСЛ-О )","markers":["РЭА","Кальпротектин фек","Антитела к тканевой трансглутаминазе, IgA","Анализ кала на скрытую кровь","Зонулин"],"simple":false}	8	t
18	lab_order_item	{"name":"Органы и системы","markers":["Скорость клубочковой фильтрации (СКФ)"],"simple":false}	9	t
19	lab_order_item	{"name":"Эли Висцеро тест 24","markers":["Омега-3 индекс"],"simple":false}	10	t
20	lab_order_item	{"name":"Гормональный статус","markers":["Тестостерон общий","Тестостерон свободный","ИСТ- индекс своб. тестостерона","ГСПГ","Пролактин","ФСГ","ЛГ","Эстрадиол","Прогестерон","ПСА общий"],"simple":false}	11	t
21	lab_order_item	{"name":"Стресс","markers":["Кортизол, слюна (утро)","Кортизил, слюна (вечер)","Дегидроэпиандростерон - ДГЭА, слюна, мкг/дл"],"simple":false}	5	t
22	lab_order_item	{"name":"ПСА свободный","markers":["СА 15-3","СА 19-9","Альфа-фетопротеин (альфа-ФП)"],"simple":false}	12	t
23	lab_order_item	{"name":"Антимюллеров гормон (АМГ)","markers":["Паратгормон"],"simple":false}	13	t
24	lab_order_item	{"name":"Генетика","markers":["Лактазная недостаточность (анализы в файле с рекомендациями)","ГЕНОТЕК"],"simple":false}	14	t
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (id, role_id, permission, granted) FROM stdin;
1	1	delete_client	t
2	1	create_client	t
3	1	import_data	t
4	2	delete_client	f
5	2	create_client	t
6	2	import_data	t
7	3	delete_client	f
8	3	create_client	f
9	3	import_data	t
10	4	delete_client	f
11	4	create_client	f
12	4	import_data	f
\.


--
-- Data for Name: role_sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_sections (id, role_id, section_id, can_read, can_write) FROM stdin;
1	1	overview	t	t
2	1	questionnaire	t	t
3	1	nutrition	t	t
4	1	protocol	t	t
5	1	injections	t	t
6	1	analytics	t	t
7	1	lab	t	t
8	1	journal	t	t
9	2	overview	t	t
10	2	questionnaire	t	t
11	2	nutrition	t	t
12	2	protocol	t	t
13	2	injections	t	t
14	2	analytics	t	t
15	2	lab	t	t
16	2	journal	t	t
17	3	overview	t	t
18	3	questionnaire	t	t
19	3	nutrition	t	t
20	3	protocol	t	t
21	3	injections	t	t
22	3	analytics	t	t
23	3	lab	t	t
24	3	journal	t	t
25	4	overview	t	f
26	4	questionnaire	t	f
27	4	nutrition	t	f
28	4	protocol	t	f
29	4	injections	t	f
30	4	analytics	t	f
31	4	lab	t	f
32	4	journal	t	f
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, display_name, is_system) FROM stdin;
1	admin	Администратор	t
2	doctor	Врач	t
3	nutritionist	Нутрициолог	f
4	viewer	Наблюдатель	f
\.


--
-- Data for Name: stages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stages (id, client_id, stage_num, title, subtitle, doctor, doctor_role, date_start, date_end, status, email, phone, city, height, weight_current, weight_goal, bmi, waist, tasks_json, syndromes_json, diagnoses_json, deficits_json, auto_deficit_selection_json, lab_order_selected_json, lab_order_group_order_json, nutrition_json, injections_json, injection_schedule_json, questionnaire_json) FROM stdin;
1	c-1774621590636	1	Этап 1		Инна	Нутрициолог			active	6871707@mail.ru	3.75297E+11	Минск	188	103	93	29.1	188	["Чувствовать себя как в 20 лет)","Перестать испытывать усталось в течении дня","Привести тело в порядок"]	[]	[]	[]	[]	{}	[]	{"generalRules":[],"categories":[],"instructions":[]}	[]	{}	{"version":2,"source":"excel","structure":"sections","gender":"male","sheetName":"Анкета для мужчин","meta":{"fullName":"Кондрашов Александр Сергеевич","email":"6871707@mail.ru","phone":"3.75297E+11","city":"Минск","height":"188","weight":"103","weightGoal":"93","waist":"188","gender":"male","goals":["Чувствовать себя как в 20 лет)","Перестать испытывать усталось в течении дня","Привести тело в порядок"]},"goals":["Чувствовать себя как в 20 лет)","Перестать испытывать усталось в течении дня","Привести тело в порядок"],"sections":[{"title":"Скелетно-мышечная система","groups":[{"title":"Скелетно-мышечная система","questions":[{"prompt":"Дискомфорт в шее, спине, пояснице","answers":["Напряжение","Редко","Нет"]}]}],"comments":[]},{"title":"Самочувствие","groups":[{"title":"Энергия","questions":[{"prompt":"Оценка","answers":["5"]},{"prompt":"Пик энергии у вас","answers":["Утром"]},{"prompt":"Как часто","answers":["Редко","Более года"]},{"prompt":"Проявление","answers":["Нет"]},{"prompt":"Отход ко сну","answers":["После 01:00"]}]},{"title":"Тревожность","questions":[{"prompt":"Как давно длится","answers":["Более года"]},{"prompt":"Оценка","answers":["2","6","7"]},{"prompt":"Как часто","answers":["Часто"]},{"prompt":"Как спите","answers":["Хорошо"]},{"prompt":"Отход ко сну","answers":["Более года"]}]},{"title":"Настроение","questions":[{"prompt":"Какое у вас настроение","answers":["Смена настроения","Раздражительность"]}]},{"title":"Сон","questions":[{"prompt":"Отход ко сну","answers":["Около 00:00"]},{"prompt":"Оценка","answers":["4"]}]},{"title":"Концентрация","questions":[{"prompt":"Оцените качество","answers":["Сложно сосредоточиться","Туман в голове"]}]}],"comments":[]},{"title":"Внешний вид","groups":[{"title":"Состояние кожи","questions":[{"prompt":"Состояние кожи","answers":["Хорошее"]},{"prompt":"Слабый тонус","answers":["Нет"]}]},{"title":"Волосы","questions":[{"prompt":"Слабый тонус","answers":["Хорошее состояние"]}]},{"title":"Ногти","questions":[{"prompt":"Слабый тонус","answers":["Хорошее состояние"]}]}],"comments":[]},{"title":"Пищеварение","groups":[{"title":"Пищеварение","questions":[{"prompt":"Пищеварение","answers":["Тяжесть","Вздутие","Более года"]}]},{"title":"Язык","questions":[{"prompt":"Состояние языка (оценивать натощак, до чистки зубов)","answers":["Нет","Оформленный (колбаской)","Отдельными фрагментами","1 раз в 2 дня"]}]}],"comments":[]},{"title":"Мужское здоровье","groups":[{"title":"Либидо","questions":[{"prompt":"Боль при мочеиспускании","answers":["Нет"]},{"prompt":"Либидо","answers":["Снижено"]}]},{"title":"Потенция","questions":[{"prompt":"Боль при мочеиспускании","answers":["Нет"]},{"prompt":"Потенция","answers":["Снижена"]}]}],"comments":[]},{"title":"Наследственность и генетика","groups":[{"title":"Анамнез","questions":[{"prompt":"Заболевания у ближайших родственников","answers":["Серьезных не было"]}]}],"comments":[]},{"title":"Дыхательная система","groups":[{"title":"Дыхательная система","questions":[{"prompt":"Нарушение дыхания","answers":["Нет"]},{"prompt":"Приступы удушья","answers":["Кальян"]}]}],"comments":[]},{"title":"Сердечно-сосудистая система","groups":[{"title":"Сердечно-сосудистая система","questions":[{"prompt":"Артериальное давление","answers":["Не знаю","Нет"]}]}],"comments":[]},{"title":"Имунная система","groups":[{"title":"Иммунитет","questions":[{"prompt":"Простудные и вирусные заболевания","answers":["1 раз в год","Нет","С детства"]},{"prompt":"2 раза в год","answers":["Легкое течение болезни","На пыль"]}]}],"comments":[]},{"title":"Питание и пищевые привычки","groups":[{"title":"Питание и пищевые привычки","questions":[{"prompt":"Питание и пищевые привычки","answers":["50%","Другое (укажите в комментариях)"]},{"prompt":"Насколько вы придерживаетесь здорового рациона","answers":["Нет","Крупы","Макароны","Каши","Морепродукты","Яйца","Рыба","Кофе","1-2 кружки в день","Каждый день","Омлет, яйца","Еда, приготовленная дома","Рыба + овощи","Мясо + гарнир","Крупы, каши"]},{"prompt":"Гипоаллергенная","answers":["1-2 раза в неделю","Хлеб","Орехи, семена","Почти каждый день","Не употребляю","2-4 раза в месяц","Почти не ем","1-2 стакана в день","4 и более","20:00-21:00"]}]}],"comments":[]},{"title":"Физическая активность","groups":[{"title":"Физическая активность","questions":[{"prompt":"Вид физической активности","answers":["Фитнес","2-3 тренировки в неделю","Около 1 часа","Отличная, в удовольствие"]},{"prompt":"Велоспорт","answers":["Мало хожу"]}]}],"comments":[]},{"title":"Уровень стресса","groups":[{"title":"Стресс","questions":[{"prompt":"Уровень стресса","answers":["40%"]},{"prompt":"Оцените свой уровень стресса","answers":["Работа, бизнес","Эмоциональный стресс","Нет"]},{"prompt":"Мало отдыха","answers":["Около года"]}]}],"comments":[]},{"title":"Вредные привычки","groups":[{"title":"Привычки","questions":[{"prompt":"Привычки","answers":["Каждую неделю"]},{"prompt":"Почти каждый день","answers":["Крепкие напитки"]},{"prompt":"Алкоголь","answers":["Нет"]}]}],"comments":[]},{"title":"Анамез","groups":[{"title":"Анамнез","questions":[{"prompt":"Хронические заболевания","answers":["Нет"]},{"prompt":"В настоящий момент","answers":["Нет"]}]}],"comments":[]},{"title":"Прием витаминов и медикаментов","groups":[{"title":"Анамнез","questions":[{"prompt":"Прием добавок","answers":["Ничего не принимаю","Нет"]},{"prompt":"Пью более 10 препаратов","answers":["Магний"]}]}],"comments":[]},{"title":"Оценка готовности","groups":[{"title":"Оценка готовности","questions":[{"prompt":"Оценка готовности","answers":["5"]}]}],"comments":[]}],"rawAnswers":[{"section":"Самочувствие","group":"Энергия","prompt":"Оценка","answer":"5"},{"section":"Самочувствие","group":"Энергия","prompt":"Пик энергии у вас","answer":"Утром"},{"section":"Самочувствие","group":"Энергия","prompt":"Как часто","answer":"Редко"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Более года"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"2"},{"section":"Самочувствие","group":"Энергия","prompt":"Проявление","answer":"Нет"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"6"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Смена настроения"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Более года"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Раздражительность"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"7"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как спите","answer":"Хорошо"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Сон","prompt":"Отход ко сну","answer":"Около 00:00"},{"section":"Самочувствие","group":"Энергия","prompt":"Как часто","answer":"Более года"},{"section":"Самочувствие","group":"Энергия","prompt":"Отход ко сну","answer":"После 01:00"},{"section":"Самочувствие","group":"Сон","prompt":"Оценка","answer":"4"},{"section":"Самочувствие","group":"Концентрация","prompt":"Оцените качество","answer":"Сложно сосредоточиться"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Концентрация","prompt":"Оцените качество","answer":"Туман в голове"},{"section":"Самочувствие","group":"Тревожность","prompt":"Отход ко сну","answer":"Более года"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Состояние кожи","answer":"Хорошее"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Слабый тонус","answer":"Нет"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Слабый тонус","answer":"Нет"},{"section":"Внешний вид","group":"Волосы","prompt":"Слабый тонус","answer":"Хорошее состояние"},{"section":"Внешний вид","group":"Ногти","prompt":"Слабый тонус","answer":"Хорошее состояние"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Пищеварение","answer":"Тяжесть"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Пищеварение","answer":"Вздутие"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Пищеварение","answer":"Более года"},{"section":"Пищеварение","group":"Язык","prompt":"Состояние языка (оценивать натощак, до чистки зубов)","answer":"Нет"},{"section":"Пищеварение","group":"Язык","prompt":"Состояние языка (оценивать натощак, до чистки зубов)","answer":"Оформленный (колбаской)"},{"section":"Пищеварение","group":"Язык","prompt":"Состояние языка (оценивать натощак, до чистки зубов)","answer":"Отдельными фрагментами"},{"section":"Пищеварение","group":"Язык","prompt":"Состояние языка (оценивать натощак, до чистки зубов)","answer":"1 раз в 2 дня"},{"section":"Мужское здоровье","group":"Либидо","prompt":"Боль при мочеиспускании","answer":"Нет"},{"section":"Мужское здоровье","group":"Либидо","prompt":"Либидо","answer":"Снижено"},{"section":"Мужское здоровье","group":"Потенция","prompt":"Боль при мочеиспускании","answer":"Нет"},{"section":"Мужское здоровье","group":"Потенция","prompt":"Потенция","answer":"Снижена"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Нарушение дыхания","answer":"Нет"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Нарушение дыхания","answer":"Нет"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Приступы удушья","answer":"Кальян"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Не знаю"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Нет"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Нет"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Напряжение"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Редко"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"1 раз в год"},{"section":"Имунная система","group":"Иммунитет","prompt":"2 раза в год","answer":"Легкое течение болезни"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Нет"},{"section":"Имунная система","group":"Иммунитет","prompt":"2 раза в год","answer":"На пыль"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"С детства"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"50%"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"Другое (укажите в комментариях)"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Крупы"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Хлеб"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Макароны"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каши"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Морепродукты"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Орехи, семена"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Яйца"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Рыба"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Почти каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Не употребляю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"2-4 раза в месяц"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Почти не ем"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Почти каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Почти каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"1-2 стакана в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Кофе"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 кружки в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"4 и более"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Омлет, яйца"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каши"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Еда, приготовленная дома"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"20:00-21:00"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Рыба + овощи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Мясо + гарнир"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Крупы, каши"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Фитнес"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"2-3 тренировки в неделю"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Около 1 часа"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Отличная, в удовольствие"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Велоспорт","answer":"Мало хожу"},{"section":"Уровень стресса","group":"Стресс","prompt":"Уровень стресса","answer":"40%"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Работа, бизнес"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Эмоциональный стресс"},{"section":"Уровень стресса","group":"Стресс","prompt":"Мало отдыха","answer":"Около года"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Нет"},{"section":"Вредные привычки","group":"Привычки","prompt":"Привычки","answer":"Каждую неделю"},{"section":"Вредные привычки","group":"Привычки","prompt":"Почти каждый день","answer":"Крепкие напитки"},{"section":"Вредные привычки","group":"Привычки","prompt":"Алкоголь","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"В настоящий момент","answer":"Нет"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Ничего не принимаю"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Пью более 10 препаратов","answer":"Магний"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Нет"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Нет"},{"section":"Наследственность и генетика","group":"Анамнез","prompt":"Заболевания у ближайших родственников","answer":"Серьезных не было"},{"section":"Оценка готовности","group":"Оценка готовности","prompt":"Оценка готовности","answer":"5"}],"normalized":{"wellbeing":{"energy":{"score":5,"peak":"Утром","frequency":"Редко","duration":"Более года"},"anxiety":{"score":2,"manifestation":"Нет"},"mood":{"score":6,"frequency":"Часто","manifestation":"Смена настроения, Раздражительность","duration":"Более года"},"sleep":{"score":7,"quality":"Хорошо","frequency":"Часто","bedtime":"Около 00:00, После 01:00","duration":"Более года"},"focus":{"score":4,"quality":"Сложно сосредоточиться, Туман в голове","frequency":"Часто","duration":"Более года"}},"appearance":{"skinState":"Хорошее","skinRash":"Нет","skinRashFrequency":"","edema":"Нет","edemaFrequency":"","hair":"Хорошее состояние","nails":"Хорошее состояние","comments":""},"digestion":{"afterMealSensation":"Тяжесть, Вздутие, Более года","afterMealDuration":"","tongueState":"","breathOdor":"Нет","stool":"Оформленный (колбаской), Отдельными фрагментами","stoolFrequency":"1 раз в 2 дня","comments":""},"maleHealth":{"libido":"Снижено","potency":"Снижена","painUrination":"Нет","weakStream":"Нет","comments":""},"femaleHealth":{},"immune":{"coldViral":"1 раз в год","covid19":"Легкое течение болезни, С детства","postCovidChanges":"","herpes":"Нет","allergy":"На пыль","allergyDuration":"","autoimmune":"Нет","comments":""},"stress":{"level":40,"sources":"Работа, бизнес, Эмоциональный стресс","duration":"Около года","coping":"Нет","comments":""},"habits":{"alcohol":"Каждую неделю","alcoholDrinks":"Крепкие напитки","stimulants":"Нет","comments":""},"history":{"chronicDiseases":"Нет","oncology":"Нет","surgeriesTrauma":"Нет","severeInfections":"Нет","checkups":"Нет","comments":"","heredity":"Серьезных не было","chronic":"Нет, Ничего не принимаю, Магний"},"cardio":{"bloodPressure":"Не знаю","arrhythmia":"Нет","heartPain":"Нет","heartPainTriggers":"","heartPainFrequency":"","comments":""},"respiratory":{"breathingIssue":"Нет","breathingIssueFrequency":"","cough":"Нет","smoking":"Кальян","comments":""},"musculoskeletal":{"neckBackLowerBackDiscomfort":"Напряжение","neckBackLowerBackFrequency":"Редко","muscleDiscomfort":"Нет","jointDiscomfort":"Нет","jointManifestation":"","jointFrequency":"","legEdema":"Нет","comments":""},"nutrition":{"healthyDietPercent":50,"habitualDiet":"Другое (укажите в комментариях)","foodReactionAllergy":"Нет","cravings":"Нет","cravingsDegree":"","sugarUse":"","sugarCoffeeTea":"Нет","sugarSweetsDesserts":"1-2 раза в неделю","regularCarbs":"Крупы, Хлеб, Макароны, Каши","proteinMain":"Морепродукты, Орехи, семена, Яйца, Рыба","proteinFrequency":"Почти каждый день","redMeat":"Не употребляю","fishSeafood":"2-4 раза в месяц","proteinComments":"","fatsMain":"","fatsFrequency":"Почти не ем","friedFoodGolden":"","transFatsLabels":"Нет","fatsData":"","fatsComments":"","fiberVegetables":"Почти каждый день","fiberFruits":"Почти каждый день","fiberTracking":"Нет","fiberData":"","fiberComments":"","hydrationWaterAmount":"1-2 стакана в день","hydrationOtherDrinks":"Кофе","hydrationCoffee":"1-2 кружки в день","hydrationData":"","hydrationComments":"","mealMealsPerDay":"4 и более","mealSnacks":"Нет","mealStressEating":"Нет","mealBreakfast":"Каждый день","mealBreakfastProducts":"Омлет, яйца, Каши","mealLunch":"Каждый день","mealLunchWhereWorkdays":"Еда, приготовленная дома","mealDinner":"Каждый день","mealDinnerTime":"20:00-21:00","mealDinnerComposition":"Рыба + овощи, Мясо + гарнир, Крупы, каши","mealRegimenData":"","mealRegimenComments":"","comments":""},"activity":{"activityType":"Фитнес","regularity":"2-3 тренировки в неделю","sessionDuration":"Около 1 часа","fitnessTolerance":"Отличная, в удовольствие","dailyActivity":"Мало хожу","comments":""}}}
2	c-1774621684239	1	Этап 1		Ульяна	Эндокринолог			active	tatyana@tduzti.com		Полевской	166	50	50	18.1	68	["Успокоить (стабилизировать) нервную систему (избавится от излишней тревоги), не принимать проблемы близко к сердцу)","Мобилизовать скрытую энергию и ресурсы (чтобы огромный поток информации перерабатывать усваивать)","Восстановить либидо","Восстановить здоровье кожи, волос и ногтей (избавить от ломкости и выпадения волос)(избавиться от целлюлита)","Избавится от головных болей и панических атак"]	[]	[]	[]	[]	{}	[]	{"generalRules":[],"categories":[],"instructions":[]}	[]	{}	{"version":2,"source":"excel","structure":"sections","gender":"female","sheetName":"Анкета для женщин ","meta":{"fullName":"Ручьева Татьяна Николаевна","email":"tatyana@tduzti.com","phone":"","city":"Полевской","height":"166","weight":"50","weightGoal":"50","waist":"68","gender":"female","goals":["Успокоить (стабилизировать) нервную систему (избавится от излишней тревоги), не принимать проблемы близко к сердцу)","Мобилизовать скрытую энергию и ресурсы (чтобы огромный поток информации перерабатывать усваивать)","Восстановить либидо","Восстановить здоровье кожи, волос и ногтей (избавить от ломкости и выпадения волос)(избавиться от целлюлита)","Избавится от головных болей и панических атак"]},"goals":["Успокоить (стабилизировать) нервную систему (избавится от излишней тревоги), не принимать проблемы близко к сердцу)","Мобилизовать скрытую энергию и ресурсы (чтобы огромный поток информации перерабатывать усваивать)","Восстановить либидо","Восстановить здоровье кожи, волос и ногтей (избавить от ломкости и выпадения волос)(избавиться от целлюлита)","Избавится от головных болей и панических атак"],"sections":[{"title":"Скелетно-мышечная система","groups":[{"title":"Скелетно-мышечная система","questions":[{"prompt":"Скелетно-мышечная система","answers":["Острые боли"]},{"prompt":"Дискомфорт в шее, спине, пояснице","answers":["Часто","Плечи","Скованность","Нет"]},{"prompt":"Судороги","answers":["Острые боли","Тазобедренные","В пальцах ног","Острая боль","После эмоциональной нагрузки"]}]}],"comments":[]},{"title":"Самочувствие","groups":[{"title":"Энергия","questions":[{"prompt":"Оценка","answers":["3"]},{"prompt":"Как часто","answers":["Редко"]},{"prompt":"Пик энергии у вас","answers":["Днем"]},{"prompt":"Проявление","answers":["Сложно избавиться от навязчивых мыслей","Проявляется в стрессовых ситуациях","Панические атаки"]}]},{"title":"Тревожность","questions":[{"prompt":"Как давно длится","answers":["Менее года","Более года"]},{"prompt":"Оценка","answers":["9","5","7"]},{"prompt":"Как часто","answers":["Часто"]},{"prompt":"Как спите","answers":["Хорошо"]},{"prompt":"Оцените качество","answers":["Отлично"]},{"prompt":"Отход ко сну","answers":["Более года"]}]},{"title":"Настроение","questions":[{"prompt":"Какое у вас настроение","answers":["Апатия","Раздражительность","Депрессия"]}]},{"title":"Сон","questions":[{"prompt":"Оценка","answers":["8"]}]}],"comments":[]},{"title":"Внешний вид","groups":[{"title":"Состояние кожи","questions":[{"prompt":"Состояние кожи","answers":["Хорошее","Сухость, шелушения","Слабый тонус"]},{"prompt":"Витилиго","answers":["Часто","Нет","Редко"]}]},{"title":"Папилломы на теле","questions":[{"prompt":"Папилломы на теле","answers":["Черные точки"]}]},{"title":"Волосы","questions":[{"prompt":"Волосы","answers":["Повышенное выпадение","Аллопеция (частичное или полное выпадение \\nволос на определенных участках)"]},{"prompt":"Витилиго","answers":["Секутся"]}]},{"title":"Ногти","questions":[{"prompt":"Витилиго","answers":["Хорошее состояние"]}]}],"comments":[]},{"title":"Пищеварение","groups":[{"title":"Пищеварение","questions":[{"prompt":"Пищеварение","answers":["Тяжесть"]},{"prompt":"Вздутие","answers":["Более года"]},{"prompt":"Изжога","answers":["Оформленный (колбаской)","1-2 раза в день"]}]},{"title":"Язык","questions":[{"prompt":"Изжога","answers":["Розовый, чистый, без налета","Нет"]}]}],"comments":[]},{"title":"Прием витаминов и медикаментов","groups":[{"title":"Анамнез","questions":[{"prompt":"Анамнез","answers":["Пью более 3 препаратов"]},{"prompt":"Пью более 10 препаратов","answers":["Омега 3","Магний"]},{"prompt":"Прием добавок","answers":["Витамин Д","Нет"]}]}],"comments":[]},{"title":"Женское здоровье","groups":[{"title":"Цикл","questions":[{"prompt":"Менструальный цикл","answers":["Регулярный","Испытываю раздражительность и агрессию","3-5 дней","Часто","Каждый цикл","Испытываю слабость и усталость","Скудная — менее 1 прокладки в день","Нет","Крайне редко, только после приема антибиотиков","Противозачаточные таблетки","Низкое","Отсутствует","Раз в год"]}]},{"title":"Женское здоровье","questions":[{"prompt":"Раздувает нижнюю часть живота","answers":["Головные боли и слабость","Более года","Боль сложно терпеть, принимаю обезболивающие","Раз в полгода"]}]}],"comments":[]},{"title":"Дыхательная система","groups":[{"title":"Дыхательная система","questions":[{"prompt":"Перехватывает дыхание","answers":["Приступы удушья","Кальян"]},{"prompt":"Нарушение дыхания","answers":["Редко","Нет"]}]}],"comments":[]},{"title":"Сердечно-сосудистая система","groups":[{"title":"Сердечно-сосудистая система","questions":[{"prompt":"Сердечно-сосудистая система","answers":["Повышено, более 140/90"]},{"prompt":"Понижео, менее 100/60","answers":["Частое сердцебиение","В грудной клетке"]},{"prompt":"Артериальное давление","answers":["При стрессе","Часто"]}]}],"comments":[]},{"title":"Имунная система","groups":[{"title":"Иммунитет","questions":[{"prompt":"Иммунитет","answers":["2 раза в год"]},{"prompt":"Простудные и вирусные заболевания","answers":["1 раз в год","Слабость, утомляемость"]},{"prompt":"Легкое течение болезни","answers":["Тяжелое течение с осложнениями","Ухудшение памяти","Выпадение волос","2-3 раза в год","Не знаю"]}]}],"comments":[]},{"title":"Питание и пищевые привычки","groups":[{"title":"Питание и пищевые привычки","questions":[{"prompt":"Питание и пищевые привычки","answers":["40%","Овощи","Выпечка и десерты"]},{"prompt":"Насколько вы придерживаетесь здорового рациона","answers":["Нет","Немного","Крупы","Картофель","Макароны","Красное мясо","Яйца","Молочные продукты","1-2 раза в неделю","Сливочное масло","Оливковое масло","В каждый прием пищи","Более 3-5 стаканов в день","Чай","1-2 кружки в день","2","Сыр","Не всегда","Еда, приготовленная дома","Каждый день","18:00-19:00"]},{"prompt":"Кето-диета","answers":["Сыр и молочные продукты","1-2 ложки","1-2 раза в неделю","Хлеб","Подсолнечное масло","2-4 раза в месяц","Почти каждый день","Минеральная вода","Не завтракаю","Йогурт","Доставка еды","20:00-21:00"]}]}],"comments":[]},{"title":"Физическая активность","groups":[{"title":"Физическая активность","questions":[{"prompt":"Вид физической активности","answers":["Фитнес","2-3 тренировки в неделю","Отличная, в удовольствие","Нормальная"]},{"prompt":"Велоспорт","answers":["Мало хожу"]}]}],"comments":[]},{"title":"Уровень стресса","groups":[{"title":"Стресс","questions":[{"prompt":"Уровень стресса","answers":["80%","70%"]},{"prompt":"Стресс","answers":["Мало отдыха","Сложные отношения в семье","3-5 лет"]},{"prompt":"Оцените свой уровень стресса","answers":["Работа, бизнес","Эмоциональный стресс","Нет"]}]}],"comments":[]},{"title":"Вредные привычки","groups":[{"title":"Привычки","questions":[{"prompt":"Алкоголь","answers":["Нет","Вино"]}]}],"comments":[]},{"title":"Анамез","groups":[{"title":"Анамнез","questions":[{"prompt":"Хронические заболевания","answers":["Есть (укажите в комментариях)","Нет"]},{"prompt":"В настоящий момент","answers":["Нет"]}]}],"comments":[]},{"title":"Наследственность и генетика","groups":[{"title":"Анамнез","questions":[{"prompt":"Анамнез","answers":["Онкология"]}]}],"comments":[]},{"title":"Оценка готовности","groups":[{"title":"Оценка готовности","questions":[{"prompt":"Оценка готовности","answers":["4"]}]}],"comments":[]}],"rawAnswers":[{"section":"Самочувствие","group":"Энергия","prompt":"Оценка","answer":"3"},{"section":"Самочувствие","group":"Энергия","prompt":"Как часто","answer":"Редко"},{"section":"Самочувствие","group":"Энергия","prompt":"Пик энергии у вас","answer":"Днем"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Менее года"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"9"},{"section":"Самочувствие","group":"Энергия","prompt":"Проявление","answer":"Сложно избавиться от навязчивых мыслей"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Более года"},{"section":"Самочувствие","group":"Энергия","prompt":"Проявление","answer":"Проявляется в стрессовых ситуациях"},{"section":"Самочувствие","group":"Энергия","prompt":"Проявление","answer":"Панические атаки"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"5"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Менее года"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Апатия"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Раздражительность"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Депрессия"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"7"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как спите","answer":"Хорошо"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Сон","prompt":"Оценка","answer":"8"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оцените качество","answer":"Отлично"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Тревожность","prompt":"Отход ко сну","answer":"Более года"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Состояние кожи","answer":"Хорошее"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Состояние кожи","answer":"Сухость, шелушения"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Состояние кожи","answer":"Слабый тонус"},{"section":"Внешний вид","group":"Папилломы на теле","prompt":"Папилломы на теле","answer":"Черные точки"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Витилиго","answer":"Часто"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Витилиго","answer":"Нет"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Витилиго","answer":"Редко"},{"section":"Внешний вид","group":"Волосы","prompt":"Волосы","answer":"Повышенное выпадение"},{"section":"Внешний вид","group":"Волосы","prompt":"Витилиго","answer":"Секутся"},{"section":"Внешний вид","group":"Волосы","prompt":"Волосы","answer":"Аллопеция (частичное или полное выпадение \\nволос на определенных участках)"},{"section":"Внешний вид","group":"Ногти","prompt":"Витилиго","answer":"Хорошее состояние"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Пищеварение","answer":"Тяжесть"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Вздутие","answer":"Более года"},{"section":"Пищеварение","group":"Язык","prompt":"Изжога","answer":"Розовый, чистый, без налета"},{"section":"Пищеварение","group":"Язык","prompt":"Изжога","answer":"Нет"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Изжога","answer":"Оформленный (колбаской)"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Изжога","answer":"1-2 раза в день"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Регулярный"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Испытываю раздражительность и агрессию"},{"section":"Женское здоровье","group":"Женское здоровье","prompt":"Раздувает нижнюю часть живота","answer":"Головные боли и слабость"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"3-5 дней"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Часто"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Каждый цикл"},{"section":"Женское здоровье","group":"Женское здоровье","prompt":"Раздувает нижнюю часть живота","answer":"Более года"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Испытываю слабость и усталость"},{"section":"Женское здоровье","group":"Женское здоровье","prompt":"Раздувает нижнюю часть живота","answer":"Боль сложно терпеть, принимаю обезболивающие"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Скудная — менее 1 прокладки в день"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Нет"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Крайне редко, только после приема антибиотиков"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Противозачаточные таблетки"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Нет"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Нет"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Низкое"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Отсутствует"},{"section":"Женское здоровье","group":"Цикл","prompt":"Менструальный цикл","answer":"Раз в год"},{"section":"Женское здоровье","group":"Женское здоровье","prompt":"Раздувает нижнюю часть живота","answer":"Раз в полгода"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Перехватывает дыхание","answer":"Приступы удушья"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Нарушение дыхания","answer":"Редко"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Нарушение дыхания","answer":"Нет"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Перехватывает дыхание","answer":"Кальян"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Сердечно-сосудистая система","answer":"Повышено, более 140/90"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Понижео, менее 100/60","answer":"Частое сердцебиение"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Понижео, менее 100/60","answer":"В грудной клетке"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"При стрессе"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Часто"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Скелетно-мышечная система","answer":"Острые боли"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Часто"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Судороги","answer":"Острые боли"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Судороги","answer":"Тазобедренные"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Плечи"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Судороги","answer":"В пальцах ног"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Скованность"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Судороги","answer":"Острая боль"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Судороги","answer":"После эмоциональной нагрузки"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Имунная система","group":"Иммунитет","prompt":"Иммунитет","answer":"2 раза в год"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"1 раз в год"},{"section":"Имунная система","group":"Иммунитет","prompt":"Легкое течение болезни","answer":"Тяжелое течение с осложнениями"},{"section":"Имунная система","group":"Иммунитет","prompt":"Легкое течение болезни","answer":"Ухудшение памяти"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Слабость, утомляемость"},{"section":"Имунная система","group":"Иммунитет","prompt":"Легкое течение болезни","answer":"Выпадение волос"},{"section":"Имунная система","group":"Иммунитет","prompt":"Легкое течение болезни","answer":"2-3 раза в год"},{"section":"Имунная система","group":"Иммунитет","prompt":"Легкое течение болезни","answer":"Не знаю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"40%"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Сыр и молочные продукты"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Немного"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"1-2 ложки"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Крупы"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Картофель"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Хлеб"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Макароны"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"Овощи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Красное мясо"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Яйца"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Молочные продукты"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Сливочное масло"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Подсолнечное масло"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"Выпечка и десерты"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Оливковое масло"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"В каждый прием пищи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"2-4 раза в месяц"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Почти каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Более 3-5 стаканов в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Чай"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Минеральная вода"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 кружки в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"2"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Не завтракаю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Сыр"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Йогурт"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Не всегда"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Еда, приготовленная дома"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"Доставка еды"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Кето-диета","answer":"20:00-21:00"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"18:00-19:00"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Фитнес"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"2-3 тренировки в неделю"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Отличная, в удовольствие"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Нормальная"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Велоспорт","answer":"Мало хожу"},{"section":"Уровень стресса","group":"Стресс","prompt":"Уровень стресса","answer":"80%"},{"section":"Уровень стресса","group":"Стресс","prompt":"Уровень стресса","answer":"70%"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"Мало отдыха"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Работа, бизнес"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Эмоциональный стресс"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"Сложные отношения в семье"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"3-5 лет"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Нет"},{"section":"Вредные привычки","group":"Привычки","prompt":"Алкоголь","answer":"Нет"},{"section":"Вредные привычки","group":"Привычки","prompt":"Алкоголь","answer":"Вино"},{"section":"Вредные привычки","group":"Привычки","prompt":"Алкоголь","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Есть (укажите в комментариях)"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"В настоящий момент","answer":"Нет"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Анамнез","answer":"Пью более 3 препаратов"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Пью более 10 препаратов","answer":"Омега 3"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Витамин Д"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Пью более 10 препаратов","answer":"Магний"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Нет"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Нет"},{"section":"Наследственность и генетика","group":"Анамнез","prompt":"Анамнез","answer":"Онкология"},{"section":"Оценка готовности","group":"Оценка готовности","prompt":"Оценка готовности","answer":"4"}],"normalized":{"wellbeing":{"energy":{"score":3,"frequency":"Редко","peak":"Днем","duration":"Менее года"},"anxiety":{"score":9,"manifestation":"Сложно избавиться от навязчивых мыслей, Проявляется в стрессовых ситуациях, Панические атаки","frequency":"Часто","duration":"Более года"},"mood":{"score":5,"frequency":"Часто","duration":"Менее года","manifestation":"Апатия, Раздражительность, Депрессия"},"sleep":{"score":7,"quality":"Хорошо","frequency":"Часто"},"focus":{"score":8,"quality":"Отлично","frequency":"Часто","duration":"Более года"}},"appearance":{"skinState":"Хорошее, Сухость, шелушения, Слабый тонус","skinRash":"Черные точки","skinRashFrequency":"Часто","edema":"Нет","edemaFrequency":"Редко","hair":"Повышенное выпадение, Секутся, Аллопеция (частичное или полное выпадение, волос на определенных участках)","nails":"Хорошее состояние","comments":""},"digestion":{"afterMealSensation":"Тяжесть, Более года","afterMealDuration":"","tongueState":"Розовый, чистый, без налета","breathOdor":"Нет","stool":"Оформленный (колбаской)","stoolFrequency":"1-2 раза в день","comments":""},"maleHealth":{"libido":"","potency":"","painUrination":"","weakStream":"","comments":""},"femaleHealth":{"cycle":"Регулярный, Испытываю раздражительность и агрессию, 3-5 дней, Часто, Каждый цикл, Испытываю слабость и усталость, Скудная — менее 1 прокладки в день, Нет, Крайне редко, только после приема антибиотиков, Противозачаточные таблетки, Низкое, Отсутствует, Раз в год","manifestation":"Головные боли и слабость, Более года, Боль сложно терпеть, принимаю обезболивающие, Раз в полгода"},"immune":{"coldViral":"2 раза в год, 1 раз в год","covid19":"Тяжелое течение с осложнениями","postCovidChanges":"Ухудшение памяти, Слабость, утомляемость, Выпадение волос","herpes":"2-3 раза в год","allergy":"","allergyDuration":"","autoimmune":"Не знаю","comments":""},"stress":{"level":80,"sources":"Мало отдыха, Работа, бизнес, Эмоциональный стресс, Сложные отношения в семье","duration":"3-5 лет","coping":"Нет","comments":""},"habits":{"alcohol":"Нет","alcoholDrinks":"Вино","stimulants":"Нет","comments":""},"history":{"chronicDiseases":"Есть (укажите в комментариях)","oncology":"Нет","surgeriesTrauma":"Нет","severeInfections":"Нет","checkups":"Нет","comments":"","chronic":"Пью более 3 препаратов, Омега 3, Магний, Витамин Д, Нет, Есть (укажите в комментариях)","heredity":"Онкология"},"cardio":{"bloodPressure":"Повышено, более 140/90","arrhythmia":"Частое сердцебиение","heartPain":"В грудной клетке","heartPainTriggers":"При стрессе","heartPainFrequency":"Часто","comments":""},"respiratory":{"breathingIssue":"Приступы удушья","breathingIssueFrequency":"Редко","cough":"Нет","smoking":"Кальян","comments":""},"musculoskeletal":{"neckBackLowerBackDiscomfort":"Острые боли","neckBackLowerBackFrequency":"Часто","muscleDiscomfort":"Острые боли","jointDiscomfort":"Тазобедренные, Плечи, В пальцах ног, Острая боль, После эмоциональной нагрузки","jointManifestation":"Скованность","jointFrequency":"","legEdema":"Нет","comments":""},"nutrition":{"healthyDietPercent":40,"habitualDiet":"","foodReactionAllergy":"Нет","cravings":"Сыр и молочные продукты","cravingsDegree":"Немного","sugarUse":"","sugarCoffeeTea":"1-2 ложки","sugarSweetsDesserts":"1-2 раза в неделю","regularCarbs":"Крупы, Картофель, Хлеб, Макароны, Овощи","proteinMain":"Красное мясо, Яйца, Молочные продукты","proteinFrequency":"","redMeat":"1-2 раза в неделю","fishSeafood":"1-2 раза в неделю","proteinComments":"","fatsMain":"Сливочное масло, Подсолнечное масло, Выпечка и десерты, Оливковое масло","fatsFrequency":"В каждый прием пищи","friedFoodGolden":"2-4 раза в месяц","transFatsLabels":"Нет","fatsData":"","fatsComments":"","fiberVegetables":"Почти каждый день, 1-2 раза в неделю","fiberFruits":"","fiberTracking":"Нет","fiberData":"","fiberComments":"","hydrationWaterAmount":"Более 3-5 стаканов в день","hydrationOtherDrinks":"Чай, Минеральная вода","hydrationCoffee":"1-2 кружки в день","hydrationData":"","hydrationComments":"","mealMealsPerDay":"2","mealSnacks":"Нет","mealStressEating":"Нет","mealBreakfast":"Не завтракаю","mealBreakfastProducts":"Сыр, Йогурт","mealLunch":"Не всегда","mealLunchWhereWorkdays":"Еда, приготовленная дома, Доставка еды","mealDinner":"Каждый день","mealDinnerTime":"20:00-21:00, 18:00-19:00","mealDinnerComposition":"","mealRegimenData":"","mealRegimenComments":"","comments":""},"activity":{"activityType":"Фитнес","regularity":"2-3 тренировки в неделю","sessionDuration":"","fitnessTolerance":"Отличная, в удовольствие, Нормальная","dailyActivity":"Мало хожу","comments":""}}}
3	c-1774621510596	1	Этап 1		Инна	Нутрициолог			active	anton@cluborg.ru		Москва	175	80	75	26.1	94	["Энергия на целый день/","Фокус и концентрация на рабочих процессах и жизни","Активное телосложение","Хорошее настроение"]	[]	[]	[]	[]	{}	[]	{"generalRules":[],"categories":[],"instructions":[]}	[]	{}	{"version":2,"source":"excel","structure":"sections","gender":"male","sheetName":"Анкета клиента ","meta":{"fullName":"Василенко Антон Николаевич","email":"anton@cluborg.ru","phone":"","city":"Москва","height":"175","weight":"80","weightGoal":"75","waist":"94","gender":"male","goals":["Энергия на целый день/","Фокус и концентрация на рабочих процессах и жизни","Активное телосложение","Хорошее настроение"]},"goals":["Энергия на целый день/","Фокус и концентрация на рабочих процессах и жизни","Активное телосложение","Хорошее настроение"],"sections":[{"title":"Скелетно-мышечная система","groups":[{"title":"Скелетно-мышечная система","questions":[{"prompt":"Дискомфорт в шее, спине, пояснице","answers":["Напряжение","Нет"]}]}],"comments":[]},{"title":"Самочувствие","groups":[{"title":"Энергия","questions":[{"prompt":"Оценка","answers":["3","4"]},{"prompt":"Пик энергии у вас","answers":["Днем","Вечером"]},{"prompt":"Как часто","answers":["Постоянно","Более года"]},{"prompt":"Отход ко сну","answers":["После 01:00"]}]},{"title":"Тревожность","questions":[{"prompt":"Как часто","answers":["Постоянно","Часто"]},{"prompt":"Как давно длится","answers":["Более года"]},{"prompt":"Проявление","answers":["Проявляется в стрессовых ситуациях"]},{"prompt":"Как спите","answers":["Хорошо"]},{"prompt":"Отход ко сну","answers":["Более года"]}]},{"title":"Настроение","questions":[{"prompt":"Какое у вас настроение","answers":["Снижено","Смена настроения","Апатия"]}]},{"title":"Сон","questions":[{"prompt":"Отход ко сну","answers":["Около 00:00"]},{"prompt":"Оценка","answers":["2"]}]},{"title":"Концентрация","questions":[{"prompt":"Оцените качество","answers":["Сложно сосредоточиться","Туман в голове"]}]}],"comments":[]},{"title":"Внешний вид","groups":[{"title":"Состояние кожи","questions":[{"prompt":"Состояние кожи","answers":["Хорошее"]},{"prompt":"Слабый тонус","answers":["Нет","Отекает лицо","Редко"]}]},{"title":"Волосы","questions":[{"prompt":"Слабый тонус","answers":["Хорошее состояние"]}]},{"title":"Ногти","questions":[{"prompt":"Слабый тонус","answers":["Хорошее состояние"]},{"prompt":"Аллопеция (частичное или полное выпадение \\nволос на определенных участках)","answers":["Ребристая ногтевая пластина"]}]}],"comments":[]},{"title":"Пищеварение","groups":[{"title":"Язык","questions":[{"prompt":"Тяжесть","answers":["Белый налет на языке","Нет","Редко"]},{"prompt":"Вздутие","answers":["Малиновый гладкий, без сосочков","2-3 раза в неделю"]}]},{"title":"Пищеварение","questions":[{"prompt":"Тяжесть","answers":["Оформленный (колбаской)","1 раз в 2 дня"]}]}],"comments":["запах только с утра после сна, язык с небольшим налетом с утра и если натощак уснул иногда желтоватые чуть слюни"]},{"title":"Мужское здоровье","groups":[{"title":"Либидо","questions":[{"prompt":"Либидо","answers":["Хорошее"]},{"prompt":"Боль при мочеиспускании","answers":["Нет"]}]},{"title":"Потенция","questions":[{"prompt":"Снижено","answers":["Хорошая"]},{"prompt":"Боль при мочеиспускании","answers":["Нет"]}]}],"comments":["очень с этим все хорошо, даже слишком))"]},{"title":"Наследственность и генетика","groups":[],"comments":["не слыхал"]},{"title":"Дыхательная система","groups":[{"title":"Дыхательная система","questions":[{"prompt":"Нарушение дыхания","answers":["Нет"]},{"prompt":"Приступы удушья","answers":["Кальян","Системы нагревания табака"]}]}],"comments":["курю если в зоне есть у кого стрельнуть айкос или кальян"]},{"title":"Сердечно-сосудистая система","groups":[{"title":"Сердечно-сосудистая система","questions":[{"prompt":"Артериальное давление","answers":["Не знаю","Нет"]}]}],"comments":[]},{"title":"Имунная система","groups":[{"title":"Иммунитет","questions":[{"prompt":"Иммунитет","answers":["2 раза в год"]},{"prompt":"Чаще","answers":["Легкое течение болезни","На пыль","Не знаю"]},{"prompt":"Простудные и вирусные заболевания","answers":["Вероятно болел","Потеря обоняния","Нет","Пищевая алергия","С детства"]}]}],"comments":["Аллергия на креветики и тому подобное, тяжело переношу баранину, у бабушки в деревнях в старых домах появляется аллергия на пыль"]},{"title":"Питание и пищевые привычки","groups":[{"title":"Питание и пищевые привычки","questions":[{"prompt":"Питание и пищевые привычки","answers":["60%","70%","Овощи"]},{"prompt":"Насколько вы придерживаетесь здорового рациона","answers":["Низкоуглеводный","Да (укажите продукт)","Немного","Нет","Крупы","Картофель","Каши","Красное мясо","Белое мясо","Рыба","Молочные продукты","В каждый прием пищи","Каждый день","1-2 раза в неделю","Жирное мясо и сало","Жирная рыба","Оливковое масло","1 раз в день","Более 3-5 стаканов в день","Чай","Кофе","1-2 кружки в день","2","3","да, 1 раз в день","Почти каждый день","Омлет, яйца","Творог, сырники","18:00-19:00","Салата","Рыба + овощи","Мясо + гарнир"]},{"prompt":"Гипоаллергенная","answers":["Сыр и молочные продукты","1-2 раза в неделю","Йогурт","Кафе, рестораны","Доставка еды","20:00-21:00"]}]}],"comments":[]},{"title":"Физическая активность","groups":[{"title":"Физическая активность","questions":[{"prompt":"Вид физической активности","answers":["Фитнес","Ходьба","2-3 тренировки в неделю","Более 1 часа","Около 1 часа","Нормальная","10 тыс. шагов"]},{"prompt":"Физическая активность","answers":["Силовые тренировки"]}]}],"comments":[]},{"title":"Уровень стресса","groups":[{"title":"Стресс","questions":[{"prompt":"Уровень стресса","answers":["80%","70%"]},{"prompt":"Стресс","answers":["Мало отдыха","Сложные отношения в семье","3-5 лет","Несколько лет","Самостоятельные практики, медитации"]},{"prompt":"Оцените свой уровень стресса","answers":["Работа, бизнес","Эмоциональный стресс","Нет"]}]}],"comments":[]},{"title":"Вредные привычки","groups":[{"title":"Привычки","questions":[{"prompt":"Алкоголь","answers":["Нет","Кофе, энергетики"]}]}],"comments":["кофе"]},{"title":"Анамез","groups":[{"title":"Анамнез","questions":[{"prompt":"Хронические заболевания","answers":["Нет","Прохожу регулярно"]}]}],"comments":["раз в год где то обследуюст"]},{"title":"Прием витаминов и медикаментов","groups":[{"title":"Анамнез","questions":[{"prompt":"Анамнез","answers":["Инъекционная терпаия"]},{"prompt":"Прием добавок","answers":["Нет"]}]}],"comments":["сейчас колю аналог оземпик(монжаро 5мг) и начинаю курс по вымыванию песка из почек ил откуда то там"]},{"title":"Оценка готовности","groups":[{"title":"Оценка готовности","questions":[{"prompt":"Оценка готовности","answers":["2"]}]}],"comments":[]}],"rawAnswers":[{"section":"Самочувствие","group":"Энергия","prompt":"Оценка","answer":"3"},{"section":"Самочувствие","group":"Энергия","prompt":"Оценка","answer":"4"},{"section":"Самочувствие","group":"Энергия","prompt":"Пик энергии у вас","answer":"Днем"},{"section":"Самочувствие","group":"Энергия","prompt":"Пик энергии у вас","answer":"Вечером"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Постоянно"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Более года"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Более года"},{"section":"Самочувствие","group":"Тревожность","prompt":"Проявление","answer":"Проявляется в стрессовых ситуациях"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Снижено"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Часто"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Смена настроения"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как давно длится","answer":"Более года"},{"section":"Самочувствие","group":"Настроение","prompt":"Какое у вас настроение","answer":"Апатия"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как спите","answer":"Хорошо"},{"section":"Самочувствие","group":"Сон","prompt":"Отход ко сну","answer":"Около 00:00"},{"section":"Самочувствие","group":"Энергия","prompt":"Как часто","answer":"Постоянно"},{"section":"Самочувствие","group":"Энергия","prompt":"Как часто","answer":"Более года"},{"section":"Самочувствие","group":"Энергия","prompt":"Отход ко сну","answer":"После 01:00"},{"section":"Самочувствие","group":"Сон","prompt":"Оценка","answer":"2"},{"section":"Самочувствие","group":"Концентрация","prompt":"Оцените качество","answer":"Сложно сосредоточиться"},{"section":"Самочувствие","group":"Концентрация","prompt":"Оцените качество","answer":"Туман в голове"},{"section":"Самочувствие","group":"Тревожность","prompt":"Как часто","answer":"Постоянно"},{"section":"Самочувствие","group":"Тревожность","prompt":"Отход ко сну","answer":"Более года"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Состояние кожи","answer":"Хорошее"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Слабый тонус","answer":"Нет"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Слабый тонус","answer":"Нет"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Слабый тонус","answer":"Отекает лицо"},{"section":"Внешний вид","group":"Состояние кожи","prompt":"Слабый тонус","answer":"Редко"},{"section":"Внешний вид","group":"Волосы","prompt":"Слабый тонус","answer":"Хорошее состояние"},{"section":"Внешний вид","group":"Ногти","prompt":"Слабый тонус","answer":"Хорошее состояние"},{"section":"Внешний вид","group":"Ногти","prompt":"Аллопеция (частичное или полное выпадение \\nволос на определенных участках)","answer":"Ребристая ногтевая пластина"},{"section":"Пищеварение","group":"Язык","prompt":"Тяжесть","answer":"Белый налет на языке"},{"section":"Пищеварение","group":"Язык","prompt":"Вздутие","answer":"Малиновый гладкий, без сосочков"},{"section":"Пищеварение","group":"Язык","prompt":"Тяжесть","answer":"Нет"},{"section":"Пищеварение","group":"Язык","prompt":"Тяжесть","answer":"Редко"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Тяжесть","answer":"Оформленный (колбаской)"},{"section":"Пищеварение","group":"Пищеварение","prompt":"Тяжесть","answer":"1 раз в 2 дня"},{"section":"Пищеварение","group":"Язык","prompt":"Вздутие","answer":"2-3 раза в неделю"},{"section":"Мужское здоровье","group":"Либидо","prompt":"Либидо","answer":"Хорошее"},{"section":"Мужское здоровье","group":"Либидо","prompt":"Боль при мочеиспускании","answer":"Нет"},{"section":"Мужское здоровье","group":"Потенция","prompt":"Снижено","answer":"Хорошая"},{"section":"Мужское здоровье","group":"Потенция","prompt":"Боль при мочеиспускании","answer":"Нет"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Нарушение дыхания","answer":"Нет"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Нарушение дыхания","answer":"Нет"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Приступы удушья","answer":"Кальян"},{"section":"Дыхательная система","group":"Дыхательная система","prompt":"Приступы удушья","answer":"Системы нагревания табака"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Не знаю"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Нет"},{"section":"Сердечно-сосудистая система","group":"Сердечно-сосудистая система","prompt":"Артериальное давление","answer":"Нет"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Напряжение"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Скелетно-мышечная система","group":"Скелетно-мышечная система","prompt":"Дискомфорт в шее, спине, пояснице","answer":"Нет"},{"section":"Имунная система","group":"Иммунитет","prompt":"Иммунитет","answer":"2 раза в год"},{"section":"Имунная система","group":"Иммунитет","prompt":"Чаще","answer":"Легкое течение болезни"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Вероятно болел"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Потеря обоняния"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Нет"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Пищевая алергия"},{"section":"Имунная система","group":"Иммунитет","prompt":"Чаще","answer":"На пыль"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"С детства"},{"section":"Имунная система","group":"Иммунитет","prompt":"Простудные и вирусные заболевания","answer":"Нет"},{"section":"Имунная система","group":"Иммунитет","prompt":"Чаще","answer":"Не знаю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"60%"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"70%"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Низкоуглеводный"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Да (укажите продукт)"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Сыр и молочные продукты"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Немного"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Крупы"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Картофель"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каши"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Питание и пищевые привычки","answer":"Овощи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Красное мясо"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Белое мясо"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Рыба"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Молочные продукты"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"В каждый прием пищи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Жирное мясо и сало"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Жирная рыба"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Оливковое масло"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1 раз в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 раза в неделю"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"В каждый прием пищи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"В каждый прием пищи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1 раз в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Более 3-5 стаканов в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Чай"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Кофе"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"1-2 кружки в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"2"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"3"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"да, 1 раз в день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Нет"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Почти каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Омлет, яйца"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Творог, сырники"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каши"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Йогурт"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Кафе, рестораны"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"Доставка еды"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Каждый день"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Гипоаллергенная","answer":"20:00-21:00"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"18:00-19:00"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Салата"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Рыба + овощи"},{"section":"Питание и пищевые привычки","group":"Питание и пищевые привычки","prompt":"Насколько вы придерживаетесь здорового рациона","answer":"Мясо + гарнир"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Фитнес"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Ходьба"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Физическая активность","answer":"Силовые тренировки"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"2-3 тренировки в неделю"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Более 1 часа"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Около 1 часа"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"Нормальная"},{"section":"Физическая активность","group":"Физическая активность","prompt":"Вид физической активности","answer":"10 тыс. шагов"},{"section":"Уровень стресса","group":"Стресс","prompt":"Уровень стресса","answer":"80%"},{"section":"Уровень стресса","group":"Стресс","prompt":"Уровень стресса","answer":"70%"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"Мало отдыха"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Работа, бизнес"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Эмоциональный стресс"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"Сложные отношения в семье"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"3-5 лет"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"Несколько лет"},{"section":"Уровень стресса","group":"Стресс","prompt":"Оцените свой уровень стресса","answer":"Нет"},{"section":"Уровень стресса","group":"Стресс","prompt":"Стресс","answer":"Самостоятельные практики, медитации"},{"section":"Вредные привычки","group":"Привычки","prompt":"Алкоголь","answer":"Нет"},{"section":"Вредные привычки","group":"Привычки","prompt":"Алкоголь","answer":"Кофе, энергетики"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Нет"},{"section":"Анамез","group":"Анамнез","prompt":"Хронические заболевания","answer":"Прохожу регулярно"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Анамнез","answer":"Инъекционная терпаия"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Нет"},{"section":"Прием витаминов и медикаментов","group":"Анамнез","prompt":"Прием добавок","answer":"Нет"},{"section":"Оценка готовности","group":"Оценка готовности","prompt":"Оценка готовности","answer":"2"}],"normalized":{"wellbeing":{"energy":{"score":4,"peak":"Днем, Вечером","frequency":"Постоянно","duration":"Более года"},"anxiety":{"frequency":"Часто","duration":"Более года","manifestation":"Проявляется в стрессовых ситуациях"},"mood":{"manifestation":"Снижено, Смена настроения, Апатия","frequency":"Часто","duration":"Более года"},"sleep":{"quality":"Хорошо","bedtime":"Около 00:00, После 01:00","frequency":"Постоянно","duration":"Более года"},"focus":{"score":2,"quality":"Сложно сосредоточиться, Туман в голове","frequency":"Постоянно","duration":"Более года"}},"appearance":{"skinState":"Хорошее","skinRash":"Нет","skinRashFrequency":"","edema":"Нет, Отекает лицо","edemaFrequency":"Редко","hair":"Хорошее состояние","nails":"Хорошее состояние, Ребристая ногтевая пластина","comments":""},"digestion":{"afterMealSensation":"","afterMealDuration":"","tongueState":"Белый налет на языке, Малиновый гладкий, без сосочков","breathOdor":"Нет, Редко","stool":"Оформленный (колбаской), 2-3 раза в неделю","stoolFrequency":"1 раз в 2 дня","comments":"запах только с утра после сна, язык с небольшим налетом с утра и если натощак уснул иногда желтоватые чуть слюни"},"maleHealth":{"libido":"Хорошее","potency":"Хорошая","painUrination":"Нет","weakStream":"Нет","comments":"очень с этим все хорошо, даже слишком))"},"femaleHealth":{},"immune":{"coldViral":"2 раза в год","covid19":"Легкое течение болезни, Вероятно болел, С детства","postCovidChanges":"Потеря обоняния","herpes":"Нет","allergy":"Пищевая алергия, На пыль","allergyDuration":"","autoimmune":"Нет, Не знаю","comments":"Аллергия на креветики и тому подобное, тяжело переношу баранину, у бабушки в деревнях в старых домах появляется аллергия на пыль"},"stress":{"level":80,"sources":"Мало отдыха, Работа, бизнес, Эмоциональный стресс, Сложные отношения в семье","duration":"3-5 лет, Несколько лет","coping":"Нет, Самостоятельные практики, медитации","comments":""},"habits":{"alcohol":"Нет","alcoholDrinks":"","stimulants":"Кофе, энергетики","comments":"кофе"},"history":{"chronicDiseases":"Нет","oncology":"Нет","surgeriesTrauma":"Нет","severeInfections":"Нет","checkups":"Прохожу регулярно","comments":"раз в год где то обследуюст","chronic":"Нет, Прохожу регулярно, Инъекционная терпаия"},"cardio":{"bloodPressure":"Не знаю","arrhythmia":"Нет","heartPain":"Нет","heartPainTriggers":"","heartPainFrequency":"","comments":""},"respiratory":{"breathingIssue":"Нет","breathingIssueFrequency":"","cough":"Нет","smoking":"Кальян, Системы нагревания табака","comments":"курю если в зоне есть у кого стрельнуть айкос или кальян"},"musculoskeletal":{"neckBackLowerBackDiscomfort":"Напряжение","neckBackLowerBackFrequency":"","muscleDiscomfort":"Нет","jointDiscomfort":"Нет","jointManifestation":"","jointFrequency":"","legEdema":"Нет","comments":""},"nutrition":{"healthyDietPercent":70,"habitualDiet":"Низкоуглеводный","foodReactionAllergy":"Да (укажите продукт)","cravings":"Сыр и молочные продукты","cravingsDegree":"Немного","sugarUse":"","sugarCoffeeTea":"Нет","sugarSweetsDesserts":"Нет, 1-2 раза в неделю","regularCarbs":"Крупы, Картофель, Каши, Овощи","proteinMain":"Красное мясо, Белое мясо, Рыба, Молочные продукты","proteinFrequency":"В каждый прием пищи","redMeat":"Каждый день","fishSeafood":"1-2 раза в неделю","proteinComments":"","fatsMain":"Жирное мясо и сало, Жирная рыба, Оливковое масло","fatsFrequency":"1 раз в день","friedFoodGolden":"1-2 раза в неделю","transFatsLabels":"Нет","fatsData":"","fatsComments":"","fiberVegetables":"В каждый прием пищи","fiberFruits":"В каждый прием пищи, 1 раз в день","fiberTracking":"Нет","fiberData":"","fiberComments":"","hydrationWaterAmount":"Более 3-5 стаканов в день","hydrationOtherDrinks":"Чай, Кофе","hydrationCoffee":"1-2 кружки в день","hydrationData":"","hydrationComments":"","mealMealsPerDay":"2, 3","mealSnacks":"да, 1 раз в день","mealStressEating":"Нет","mealBreakfast":"Почти каждый день","mealBreakfastProducts":"Омлет, яйца, Творог, сырники, Каши, Йогурт","mealLunch":"Каждый день","mealLunchWhereWorkdays":"Кафе, рестораны, Доставка еды","mealDinner":"Каждый день","mealDinnerTime":"20:00-21:00, 18:00-19:00","mealDinnerComposition":"Салата, Рыба + овощи, Мясо + гарнир","mealRegimenData":"","mealRegimenComments":"","comments":""},"activity":{"activityType":"Фитнес, Ходьба, Силовые тренировки","regularity":"2-3 тренировки в неделю","sessionDuration":"Более 1 часа, Около 1 часа","fitnessTolerance":"Нормальная","dailyActivity":"10 тыс. шагов","comments":""}}}
20	c-1773270983915	1	Этап 1	Метаболическая коррекция	Инна	Нутрициолог	06.03.2026		completed	ivanov.i@example.com	+7 999 123-45-67	Москва	178	92	82	29	102	["Снизить массу тела на 8-10 кг за 4 месяца","Нормализовать сон (засыпание до 23:30)","Снизить инсулинорезистентность","Повысить дневную энергию и выносливость"]	[{"name":"Инсулинорезистентность","severity":"high"},{"name":"Хронический стресс","severity":"high"},{"name":"Нутритивные дефициты","severity":"medium"},{"name":"Субклинический гипотиреоз","severity":"medium"}]	["Новый диагноз","Новый диагноз"]	["Витамин D","Ферритин","B12","Магний","Цинк"]	["folate","zinc"]	{}	[]	{"generalRules":[{"title":"Режим","desc":"3 основных приема пищи, ужин не позднее 20:00."},{"title":"Белок","desc":"Не менее 1.6 г/кг целевой массы ежедневно."},{"title":"Клетчатка","desc":"25-35 г/сутки за счёт овощей, зелени и ягод."},{"title":"Вода","desc":"2.2-2.5 л/сутки равномерно в течение дня."}],"categories":[{"name":"Основа рациона","products":"рыба, яйца, индейка, овощи, бобовые","instruction":"на каждый прием пищи","notes":"приоритет цельным продуктам"},{"name":"Ограничить","products":"сахар, выпечка, сладкие напитки, фастфуд","instruction":"максимум 1 порция/нед","notes":"контроль тяги к сладкому"},{"name":"Полезные жиры","products":"оливковое масло, авокадо, орехи","instruction":"ежедневно 1-2 порции","notes":"без перегрева масел"},{"name":"Ужин","products":"белок + овощи","instruction":"без быстрых углеводов","notes":"улучшение сна и гликемии"}],"instructions":[{"text":"Тарелка здорового питания (50/25/25)","url":"https://example.com/plate"},{"text":"Гид по продуктам с низкой гликемической нагрузкой","url":"https://example.com/low-glycemic"},{"text":"Чек-лист вечернего режима для сна","url":"https://example.com/sleep-checklist"}]}	[{"name":"Витамин B12 (метилкобаламин)","dose":"1000 мкг","frequency":"2 р/нед","method":"в/м","goal":"Коррекция дефицита B12","days":42},{"name":"Глутатион","dose":"600 мг","frequency":"1 р/нед","method":"в/в","goal":"Поддержка детокс-систем","days":30}]	{"startDate":"2026-03-14","phases":[{"type":"daily","durationDays":10,"startDate":"2026-04-03","times":["08:00"],"daysOfWeek":[1,3,5],"intervalDays":2,"drug":"Alpha Timozin ","dosage":"1000 ml","instruction":"Подкожно 2 см "},{"type":"daily","durationDays":10,"startDate":"2026-04-10","times":["08:00"],"daysOfWeek":[1,3,5],"intervalDays":2,"drug":"Alpha Timozin ","dosage":"500","instruction":""},{"type":"weekdays","durationDays":30,"startDate":"2026-04-17","times":["20:00"],"daysOfWeek":[1,4],"intervalDays":2,"drug":"PCV ","dosage":"100","instruction":""}]}	{"version":2,"source":"excel","structure":"sections","gender":"male","sheetName":"Анкета","meta":{"fullName":"Иванов Иван","email":"ivanov.i@example.com","phone":"+7 999 321-45-67","city":"Москва","height":"178","weight":"92","weightGoal":"82","waist":"102","gender":"male","goals":["Снижение веса","Повышение энергии","Нормализация сна"]},"goals":["Снижение веса","Повышение энергии","Нормализация сна"],"sections":[{"title":"Самочувствие","groups":[{"title":"Энергия","questions":[{"prompt":"Оценка","answers":["4"]}]},{"title":"Тревожность","questions":[{"prompt":"Оценка","answers":["6"]}]},{"title":"Настроение","questions":[{"prompt":"Оценка","answers":["5"]}]},{"title":"Сон","questions":[{"prompt":"Оценка","answers":["4"]}]}],"comments":["Просыпается уставшим, дневная сонливость."]}],"rawAnswers":[{"section":"Самочувствие","group":"Энергия","prompt":"Оценка","answer":"4"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"6"}],"normalized":{"wellbeing":{"energy":{"score":4,"peak":"Днем","frequency":"Постоянно","duration":"Более года"},"anxiety":{"score":6,"manifestation":"Навязчивые мысли вечером","frequency":"Часто","duration":"Менее года"},"mood":{"score":5,"manifestation":"Снижено","frequency":"Часто","duration":"Более 6 месяцев"},"sleep":{"score":4,"quality":"Сложно заснуть, Частые пробуждения","frequency":"Постоянно","duration":"Более года","bedtime":"После 01:00"},"focus":{"score":5,"quality":"Туман в голове","frequency":"Часто","duration":"Более 6 месяцев"},"comments":"Просыпается уставшим, дневная сонливость."},"appearance":{"skinState":"Сухость","skinRash":"Периодически","skinRashFrequency":"1-2 раза в месяц","edema":"Легкие отеки утром","edemaFrequency":"Редко","hair":"Умеренное выпадение","nails":"Ломкость","comments":"Ухудшение в период стресса."},"digestion":{"afterMealSensation":"Тяжесть, Вздутие","afterMealDuration":"1-2 часа","tongueState":"Белесый налет по утрам","breathOdor":"Иногда","stool":"1 раз в день, нестабильно","stoolFrequency":"1 раз в день","comments":"Симптомы усиливаются после позднего ужина."},"maleHealth":{"libido":"Снижено","potency":"Нестабильно","painUrination":"Нет","weakStream":"Нет","comments":"Снижение либидо при недосыпе."},"femaleHealth":{},"immune":{"coldViral":"4-5 раз в год","covid19":"Болел 1 раз","postCovidChanges":"Утомляемость","herpes":"2-3 раза в год","allergy":"Сезонный ринит","allergyDuration":"Весна","autoimmune":"Нет","comments":"Частые ОРВИ."},"stress":{"level":85,"sources":"Работа, Недосып","duration":"Более 1 года","coping":"Прогулки","comments":"На фоне стресса ухудшается сон."},"habits":{"alcohol":"1-2 раза в неделю","alcoholDrinks":"Вино/пиво","stimulants":"2-3 чашки кофе в день","comments":"Энергетики 1-2 раза в неделю."},"history":{"chronicDiseases":"Жировой гепатоз (по УЗИ)","oncology":"Нет","surgeriesTrauma":"Аппендэктомия 2012","severeInfections":"Нет","checkups":"Нерегулярно","comments":"Семейный анамнез по диабету 2 типа.","heredity":"Отец: диабет 2 типа","chronic":"Постоянных препаратов нет"},"cardio":{"bloodPressure":"130/85","arrhythmia":"Нет","heartPain":"Нет","heartPainTriggers":"","heartPainFrequency":"","comments":"Пульс в покое 78-84."},"respiratory":{"breathingIssue":"При нагрузке легкая одышка","breathingIssueFrequency":"Иногда","cough":"Нет","smoking":"Нет","comments":"Улучшение при регулярной активности."},"musculoskeletal":{"neckBackLowerBackDiscomfort":"Поясница","neckBackLowerBackFrequency":"2-3 раза в неделю","muscleDiscomfort":"После тренировок","jointDiscomfort":"Колени после бега","jointManifestation":"При высокой нагрузке","jointFrequency":"Периодически","legEdema":"Нет","comments":"Нужна работа с мобильностью."},"nutrition":{"healthyDietPercent":50,"habitualDiet":"Смешанный рацион с избытком быстрых углеводов","foodReactionAllergy":"Нет","cravings":"Сладкое, Мучное","cravingsDegree":"Умеренная","sugarUse":"Ежедневно","sugarCoffeeTea":"2 ложки","sugarSweetsDesserts":"5-6 раз в неделю","regularCarbs":"Хлеб, Макароны, Выпечка","proteinMain":"Курица, Яйца","proteinFrequency":"Ежедневно","redMeat":"1 раз в неделю","fishSeafood":"1 раз в 2 недели","proteinComments":"","fatsMain":"Молочные жиры, растительные масла","fatsFrequency":"Ежедневно","friedFoodGolden":"2-3 раза в неделю","transFatsLabels":"Не отслеживает","fatsData":"","fatsComments":"","fiberVegetables":"Ежедневно, но мало","fiberFruits":"3-4 раза в неделю","fiberTracking":"Нет","fiberData":"","fiberComments":"","hydrationWaterAmount":"1.2-1.5 л","hydrationOtherDrinks":"Кофе, чай","hydrationCoffee":"2-3 чашки","hydrationData":"","hydrationComments":"","mealMealsPerDay":"2-3","mealSnacks":"Да, вечером","mealStressEating":"Да","mealBreakfast":"Иногда пропускает","mealBreakfastProducts":"Бутерброды, каша","mealLunch":"Нерегулярно","mealLunchWhereWorkdays":"Кафе/доставка","mealDinner":"Плотный","mealDinnerTime":"После 21:00","mealDinnerComposition":"Мясо + гарнир","mealRegimenData":"","mealRegimenComments":"","comments":"Основная калорийность во второй половине дня."},"activity":{"activityType":"Ходьба, Силовые","regularity":"3-4 раза в неделю","sessionDuration":"45-60 мин","fitnessTolerance":"Средняя","dailyActivity":"6-8 тыс шагов","comments":"План: поднять до 10 тыс шагов."}}}
21	c-1773270983915	2	Энергобуст		Ульяна	Эндокринолог	27.03.2026		active	ivanov.i@example.com	+7 999 123-45-67	Москва	178	92	82	29	102	[]	[]	[]	[]	[]	{}	[]	{"generalRules":[],"categories":[],"instructions":[]}	[]	{}	{"version":2,"source":"excel","structure":"sections","gender":"male","sheetName":"Анкета","meta":{"fullName":"Иванов Иван","email":"ivanov.i@example.com","phone":"+7 999 321-45-67","city":"Москва","height":"178","weight":"92","weightGoal":"82","waist":"102","gender":"male","goals":["Снижение веса","Повышение энергии","Нормализация сна"]},"goals":["Снижение веса","Повышение энергии","Нормализация сна"],"sections":[{"title":"Самочувствие","groups":[{"title":"Энергия","questions":[{"prompt":"Оценка","answers":["4"]}]},{"title":"Тревожность","questions":[{"prompt":"Оценка","answers":["6"]}]},{"title":"Настроение","questions":[{"prompt":"Оценка","answers":["5"]}]},{"title":"Сон","questions":[{"prompt":"Оценка","answers":["4"]}]}],"comments":["Просыпается уставшим, дневная сонливость."]}],"rawAnswers":[{"section":"Самочувствие","group":"Энергия","prompt":"Оценка","answer":"4"},{"section":"Самочувствие","group":"Тревожность","prompt":"Оценка","answer":"6"}],"normalized":{"wellbeing":{"energy":{"score":4,"peak":"Днем","frequency":"Постоянно","duration":"Более года"},"anxiety":{"score":6,"manifestation":"Навязчивые мысли вечером","frequency":"Часто","duration":"Менее года"},"mood":{"score":5,"manifestation":"Снижено","frequency":"Часто","duration":"Более 6 месяцев"},"sleep":{"score":4,"quality":"Сложно заснуть, Частые пробуждения","frequency":"Постоянно","duration":"Более года","bedtime":"После 01:00"},"focus":{"score":5,"quality":"Туман в голове","frequency":"Часто","duration":"Более 6 месяцев"},"comments":"Просыпается уставшим, дневная сонливость."},"appearance":{"skinState":"Сухость","skinRash":"Периодически","skinRashFrequency":"1-2 раза в месяц","edema":"Легкие отеки утром","edemaFrequency":"Редко","hair":"Умеренное выпадение","nails":"Ломкость","comments":"Ухудшение в период стресса."},"digestion":{"afterMealSensation":"Тяжесть, Вздутие","afterMealDuration":"1-2 часа","tongueState":"Белесый налет по утрам","breathOdor":"Иногда","stool":"1 раз в день, нестабильно","stoolFrequency":"1 раз в день","comments":"Симптомы усиливаются после позднего ужина."},"maleHealth":{"libido":"Снижено","potency":"Нестабильно","painUrination":"Нет","weakStream":"Нет","comments":"Снижение либидо при недосыпе."},"femaleHealth":{},"immune":{"coldViral":"4-5 раз в год","covid19":"Болел 1 раз","postCovidChanges":"Утомляемость","herpes":"2-3 раза в год","allergy":"Сезонный ринит","allergyDuration":"Весна","autoimmune":"Нет","comments":"Частые ОРВИ."},"stress":{"level":85,"sources":"Работа, Недосып","duration":"Более 1 года","coping":"Прогулки","comments":"На фоне стресса ухудшается сон."},"habits":{"alcohol":"1-2 раза в неделю","alcoholDrinks":"Вино/пиво","stimulants":"2-3 чашки кофе в день","comments":"Энергетики 1-2 раза в неделю."},"history":{"chronicDiseases":"Жировой гепатоз (по УЗИ)","oncology":"Нет","surgeriesTrauma":"Аппендэктомия 2012","severeInfections":"Нет","checkups":"Нерегулярно","comments":"Семейный анамнез по диабету 2 типа.","heredity":"Отец: диабет 2 типа","chronic":"Постоянных препаратов нет"},"cardio":{"bloodPressure":"130/85","arrhythmia":"Нет","heartPain":"Нет","heartPainTriggers":"","heartPainFrequency":"","comments":"Пульс в покое 78-84."},"respiratory":{"breathingIssue":"При нагрузке легкая одышка","breathingIssueFrequency":"Иногда","cough":"Нет","smoking":"Нет","comments":"Улучшение при регулярной активности."},"musculoskeletal":{"neckBackLowerBackDiscomfort":"Поясница","neckBackLowerBackFrequency":"2-3 раза в неделю","muscleDiscomfort":"После тренировок","jointDiscomfort":"Колени после бега","jointManifestation":"При высокой нагрузке","jointFrequency":"Периодически","legEdema":"Нет","comments":"Нужна работа с мобильностью."},"nutrition":{"healthyDietPercent":50,"habitualDiet":"Смешанный рацион с избытком быстрых углеводов","foodReactionAllergy":"Нет","cravings":"Сладкое, Мучное","cravingsDegree":"Умеренная","sugarUse":"Ежедневно","sugarCoffeeTea":"2 ложки","sugarSweetsDesserts":"5-6 раз в неделю","regularCarbs":"Хлеб, Макароны, Выпечка","proteinMain":"Курица, Яйца","proteinFrequency":"Ежедневно","redMeat":"1 раз в неделю","fishSeafood":"1 раз в 2 недели","proteinComments":"","fatsMain":"Молочные жиры, растительные масла","fatsFrequency":"Ежедневно","friedFoodGolden":"2-3 раза в неделю","transFatsLabels":"Не отслеживает","fatsData":"","fatsComments":"","fiberVegetables":"Ежедневно, но мало","fiberFruits":"3-4 раза в неделю","fiberTracking":"Нет","fiberData":"","fiberComments":"","hydrationWaterAmount":"1.2-1.5 л","hydrationOtherDrinks":"Кофе, чай","hydrationCoffee":"2-3 чашки","hydrationData":"","hydrationComments":"","mealMealsPerDay":"2-3","mealSnacks":"Да, вечером","mealStressEating":"Да","mealBreakfast":"Иногда пропускает","mealBreakfastProducts":"Бутерброды, каша","mealLunch":"Нерегулярно","mealLunchWhereWorkdays":"Кафе/доставка","mealDinner":"Плотный","mealDinnerTime":"После 21:00","mealDinnerComposition":"Мясо + гарнир","mealRegimenData":"","mealRegimenComments":"","comments":"Основная калорийность во второй половине дня."},"activity":{"activityType":"Ходьба, Силовые","regularity":"3-4 раза в неделю","sessionDuration":"45-60 мин","fitnessTolerance":"Средняя","dailyActivity":"6-8 тыс шагов","comments":"План: поднять до 10 тыс шагов."}}}
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password_hash, role, active, created_at, all_clients_access) FROM stdin;
1	admin	$2b$10$adG3DPLMqrBaKsjCFWw50Owh.PbzUr8HNqHrv6mz3NEbJBePUqj8m	admin	t	2026-04-03 07:47:58.65322-03	f
2	juliya.ermilova1@gmail.com	$2b$10$si6.3j5Y/Bjf9S5mTr.12.yi8S4k7Ejtcyl0EMSBSSRHkpq3ywBsm	admin	t	2026-04-03 07:57:45.933141-03	f
5	doctor	$2b$10$tUc/9dXL6suXmGc1SdUzyOHGyC.c/paNuUb84aYX7UEMu7xbLJb32	doctor	t	2026-04-03 07:59:19.533439-03	f
4	2life	$2b$10$MZibhBUSRINjkLY6bIRZyuZb8gQHSRWr/ffoqhJ1N64vPxWjVgxam	doctor	t	2026-04-03 07:59:19.446475-03	f
3	nikita	$2b$10$q802Kcark9zGdD1c5OPNReV/tX3eqamTk.UGIyfPCyj77qJwhJIi.	viewer	t	2026-04-03 07:59:19.37587-03	t
\.


--
-- Name: activity_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.activity_log_id_seq', 2, true);


--
-- Name: analytics_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.analytics_categories_id_seq', 88, true);


--
-- Name: analytics_markers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.analytics_markers_id_seq', 504, true);


--
-- Name: analytics_values_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.analytics_values_id_seq', 1547, true);


--
-- Name: client_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.client_assignments_id_seq', 21, true);


--
-- Name: doctors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.doctors_id_seq', 39, true);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.journal_entries_id_seq', 45, true);


--
-- Name: nutrition_revisions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.nutrition_revisions_id_seq', 30, true);


--
-- Name: protocol_revisions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.protocol_revisions_id_seq', 30, true);


--
-- Name: reference_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reference_data_id_seq', 24, true);


--
-- Name: role_permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.role_permissions_id_seq', 12, true);


--
-- Name: role_sections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.role_sections_id_seq', 32, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_seq', 4, true);


--
-- Name: stages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stages_id_seq', 21, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: analytics_categories analytics_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_categories
    ADD CONSTRAINT analytics_categories_pkey PRIMARY KEY (id);


--
-- Name: analytics_markers analytics_markers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_markers
    ADD CONSTRAINT analytics_markers_pkey PRIMARY KEY (id);


--
-- Name: analytics_values analytics_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_values
    ADD CONSTRAINT analytics_values_pkey PRIMARY KEY (id);


--
-- Name: client_assignments client_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_pkey PRIMARY KEY (id);


--
-- Name: client_assignments client_assignments_user_id_client_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_user_id_client_id_key UNIQUE (user_id, client_id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_name_key UNIQUE (name);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: nutrition_revisions nutrition_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nutrition_revisions
    ADD CONSTRAINT nutrition_revisions_pkey PRIMARY KEY (id);


--
-- Name: protocol_revisions protocol_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_revisions
    ADD CONSTRAINT protocol_revisions_pkey PRIMARY KEY (id);


--
-- Name: reference_data reference_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reference_data
    ADD CONSTRAINT reference_data_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_role_id_permission_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_permission_key UNIQUE (role_id, permission);


--
-- Name: role_sections role_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_sections
    ADD CONSTRAINT role_sections_pkey PRIMARY KEY (id);


--
-- Name: role_sections role_sections_role_id_section_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_sections
    ADD CONSTRAINT role_sections_role_id_section_id_key UNIQUE (role_id, section_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: stages stages_client_id_stage_num_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_client_id_stage_num_key UNIQUE (client_id, stage_num);


--
-- Name: stages stages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: idx_ac_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ac_client ON public.analytics_categories USING btree (client_id);


--
-- Name: idx_al_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_al_client ON public.activity_log USING btree (client_id);


--
-- Name: idx_al_ts; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_al_ts ON public.activity_log USING btree (ts);


--
-- Name: idx_av_marker; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_av_marker ON public.analytics_values USING btree (marker_id);


--
-- Name: idx_ca_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ca_client ON public.client_assignments USING btree (client_id);


--
-- Name: idx_ca_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ca_user ON public.client_assignments USING btree (user_id);


--
-- Name: idx_je_client; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_je_client ON public.journal_entries USING btree (client_id);


--
-- Name: uq_ac_client_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_ac_client_name ON public.analytics_categories USING btree (client_id, name);


--
-- Name: uq_am_cat_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_am_cat_name ON public.analytics_markers USING btree (category_id, name);


--
-- Name: uq_av_marker_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_av_marker_date ON public.analytics_values USING btree (marker_id, date);


--
-- Name: analytics_categories analytics_categories_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_categories
    ADD CONSTRAINT analytics_categories_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: analytics_markers analytics_markers_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_markers
    ADD CONSTRAINT analytics_markers_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.analytics_categories(id) ON DELETE CASCADE;


--
-- Name: analytics_values analytics_values_marker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.analytics_values
    ADD CONSTRAINT analytics_values_marker_id_fkey FOREIGN KEY (marker_id) REFERENCES public.analytics_markers(id) ON DELETE CASCADE;


--
-- Name: client_assignments client_assignments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_assignments client_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.client_assignments
    ADD CONSTRAINT client_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: doctors doctors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: nutrition_revisions nutrition_revisions_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nutrition_revisions
    ADD CONSTRAINT nutrition_revisions_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: protocol_revisions protocol_revisions_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.protocol_revisions
    ADD CONSTRAINT protocol_revisions_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.stages(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: role_sections role_sections_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_sections
    ADD CONSTRAINT role_sections_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: stages stages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stages
    ADD CONSTRAINT stages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict iPUhnPIbHahkrEhm21MRobD5xILd7KQpowKSjvRKjRldVvz83zALeXUqBKDyXTU

