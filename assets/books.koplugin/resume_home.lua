-- Fresh-install resume homescreen for the Books bundle.
--
-- SimpleUI 2.1's Recent Books module has covers and percentages, but no book
-- titles.  This file applies the Books preset and its small Recent Books
-- renderer only to profiles explicitly marked by seedIfFresh().

local M = {}

local MARKER = "books_resume_home_v1"
local PFX = "simpleui_hs_"

function M.seedIfFresh()
    local SUISettings = require("sui_store")

    -- SimpleUI sets onboarding_done after any preset choice. Requiring the
    -- layout and active-preset keys to also be absent protects profiles that
    -- were customized before onboarding completed.
    local untouched = SUISettings:get("simpleui_onboarding_done") == nil
        and SUISettings:get("simpleui_layout") == nil
        and SUISettings:get("simpleui_hs_active_preset") == nil
    if not untouched then return false end

    local settings = {
        ["simpleui_layout"] = {
            pages = { { id = 1, modules = { "clock", "currently", "recent" } } },
        },
        [PFX .. "quote_enabled"] = false,
        [PFX .. "clock_enabled"] = true,
        [PFX .. "clock_date"] = false,
        [PFX .. "clock_battery"] = false,
        [PFX .. "currently_enabled"] = true,
        [PFX .. "recent_enabled"] = true,

        [PFX .. "currently_show_title"] = true,
        [PFX .. "currently_show_author"] = true,
        [PFX .. "currently_show_progress"] = true,
        [PFX .. "currently_show_percent"] = true,
        [PFX .. "currently_show_book_days"] = false,
        [PFX .. "currently_show_book_time"] = false,
        [PFX .. "currently_show_book_remaining"] = false,
        [PFX .. "currently_bar_style"] = "with_pct",
        [PFX .. "currently_elem_order"] = { "title", "author", "progress", "percent" },

        [PFX .. "recent_show_progress"] = false,
        [PFX .. "recent_show_text"] = true,
        [PFX .. "recent_show_overlay"] = false,
        [PFX .. "recent_show_finished"] = false,

        ["simpleui_hide_label_currently"] = false,
        ["simpleui_hide_label_recent"] = false,
        [MARKER] = true,
        -- Skip SimpleUI's preset picker: this bundle has supplied the preset.
        ["simpleui_onboarding_done"] = true,
    }
    for key, value in pairs(settings) do SUISettings:set(key, value) end
    return true
end

function M.applyRecentTitles()
    local SUISettings = require("sui_store")
    if not SUISettings:isTrue(MARKER) then return false end

    local Recent = require("desktop_modules/module_recent")
    if Recent._books_resume_home_applied then return true end

    local Blitbuffer = require("ffi/blitbuffer")
    local Device = require("device")
    local Font = require("ui/font")
    local Geom = require("ui/geometry")
    local GestureRange = require("ui/gesturerange")
    local BottomContainer = require("ui/widget/container/bottomcontainer")
    local CenterContainer = require("ui/widget/container/centercontainer")
    local FrameContainer = require("ui/widget/container/framecontainer")
    local HorizontalGroup = require("ui/widget/horizontalgroup")
    local HorizontalSpan = require("ui/widget/horizontalspan")
    local InputContainer = require("ui/widget/container/inputcontainer")
    local LeftContainer = require("ui/widget/container/leftcontainer")
    local TextBoxWidget = require("ui/widget/textboxwidget")
    local VerticalGroup = require("ui/widget/verticalgroup")
    local Config = require("sui_config")
    local UI = require("sui_core")
    local SUIStyle = require("sui_style")
    local SH = require("desktop_modules/module_books_shared")
    local Screen = Device.screen
    local PAD = UI.PAD
    local _ = require("sui_i18n").translate

    -- The 600x800 compact profile cannot fit SimpleUI's full 70-unit clock,
    -- featured block, Recent title/percentage, and navbar simultaneously.
    -- Scale only the two tall elements on that profile; Android keeps the
    -- normal module and featured-cover sizes.
    if not Config._books_resume_compact_scale_applied then
        local getModuleScale = Config.getModuleScale
        local getThumbScale = Config.getThumbScale
        Config.getModuleScale = function(mod_id, pfx)
            local scale = getModuleScale(mod_id, pfx)
            if Screen:getWidth() < 800 and mod_id == "clock" then
                return scale * 0.40
            end
            return scale
        end
        Config.getThumbScale = function(mod_id, pfx)
            local scale = getThumbScale(mod_id, pfx)
            if Screen:getWidth() < 800 and mod_id == "currently" then
                return scale * 0.80
            end
            return scale
        end
        Config._books_resume_compact_scale_applied = true
    end

    -- Keep the two book sections on one shared rhythm. SimpleUI's section
    -- labels all draw their lower spacing from LABEL_PAD_BOT, while module
    -- height estimates go through Config.getScaledLabelH(). Patch both sides
    -- together so the extra gap is rendered and measured consistently.
    if not Config._books_resume_label_gap_applied then
        local extra = Screen:scaleBySize(4)
        local getScaledLabelH = Config.getScaledLabelH
        UI.LABEL_PAD_BOT = UI.LABEL_PAD_BOT + extra
        UI.LABEL_H = UI.LABEL_H + extra
        Config.getScaledLabelH = function(...)
            return getScaledLabelH(...) + extra
        end
        Config._books_resume_label_gap_applied = true
    end

    local function layoutProfile()
        local width, height = Screen:getWidth(), Screen:getHeight()
        if width < 800 then
            return 3, 0.85, 0, 3, Screen:scaleBySize(18)
        elseif height > width then
            -- Android uses two rows of three: left, center, right. This uses
            -- the available width without shrinking the titled covers.
            return 6, 1.4, 0, 3, Screen:scaleBySize(48)
        end
        return 5, 1, 0, 5, Screen:scaleBySize(18)
    end

    local function visibleBooks(ctx)
        local books = {}
        local limit = layoutProfile()
        for _, fp in ipairs(ctx.recent_fps or {}) do
            local pd = ctx.prefetched and ctx.prefetched[fp]
            local pct = pd and pd.percent or 0
            local done = pct >= 1 or (type(pd) == "table"
                and type(pd.summary) == "table" and pd.summary.status == "complete")
            if not done then
                books[#books + 1] = fp
                if #books >= limit then break end
            end
        end
        return books
    end

    local function dimensions(ctx)
        local pfx = ctx and ctx.pfx or ""
        local scale = Config.getModuleScale("recent", pfx)
        local thumb_scale = Config.getThumbScale("recent", pfx)
        local label_scale = Config.getItemLabelScale("recent", pfx)
        local d = SH.getDims(scale, thumb_scale)
        local _, cover_scale, top_gap = layoutProfile()
        if cover_scale ~= 1 then
            d.RECENT_W = math.floor(d.RECENT_W * cover_scale)
            d.RECENT_H = math.floor(d.RECENT_H * cover_scale)
        end
        local title_fs = math.max(9, math.floor(SUIStyle.FS_DETAIL * scale * label_scale))
        local screen_w, screen_h = Screen:getWidth(), Screen:getHeight()
        if screen_w >= 800 and screen_h > screen_w then
            title_fs = math.max(9, math.floor(title_fs * 0.90))
        end
        local pct_fs = math.max(8, math.floor(SUIStyle.FS_DETAIL * scale * label_scale))
        local title_h = math.max(24,
            math.floor(Screen:scaleBySize(38) * scale * label_scale))
        return d, title_fs, pct_fs, title_h,
            math.max(2, Screen:scaleBySize(4) * scale), top_gap
    end

    function Recent.build(w, ctx)
        Config.applyLabelToggle(Recent, _("Recent Books"))
        local books = visibleBooks(ctx)
        if #books == 0 then return nil end

        local d, title_fs, pct_fs, title_h, gap_y, top_gap = dimensions(ctx)
        local inner_w = w - PAD * 2
        local _, _, _, columns, row_gap = layoutProfile()
        local slot_w = math.floor(inner_w / columns)
        -- Treat the cover, title, and percentage as one centered card. Cards
        -- are narrower than their grid slot so the first/last cards can anchor
        -- to the module edges while every element retains one centerline.
        local card_w = math.min(slot_w,
            d.RECENT_W + Screen:scaleBySize(48))
        local column_gap = columns > 1
            and math.max(0, math.floor((inner_w - columns * card_w) / (columns - 1)))
            or 0
        local title_face = Font:getFace(SUIStyle.FACE_REGULAR, title_fs)
        local pct_face = Font:getFace(SUIStyle.FACE_REGULAR, pct_fs)
        local fg = SUIStyle.getThemeColor("fg") or Blitbuffer.COLOR_BLACK
        local secondary = SUIStyle.getThemeColor("text_secondary") or fg
        local show_bar = SUISettings:get((ctx.pfx or "") .. "recent_show_progress") == true
        local show_pct = SUISettings:get((ctx.pfx or "") .. "recent_show_text") ~= false
        local cell_h = d.RECENT_H + gap_y + title_h
        if show_bar then cell_h = cell_h + gap_y + d.RB_BAR_H end
        if show_pct then cell_h = cell_h + gap_y + d.RB_LABEL_H end

        local rows = VerticalGroup:new{ align = "center" }
        local cover_slots = {}
        local function titleBox(title)
            local function makeTitle(height)
                return TextBoxWidget:new{
                    text = title or "",
                    face = title_face,
                    bold = true,
                    width = card_w,
                    height = height,
                    height_overflow_show_ellipsis = height ~= nil,
                    line_height = 0.18,
                    alignment = "center",
                    alignment_strict = true,
                    fgcolor = fg,
                    bgcolor = nil,
                    alpha = true,
                }
            end
            local title_widget = makeTitle(nil)
            if title_widget:getSize().h > title_h then
                title_widget:free(true)
                title_widget = makeTitle(title_h)
            end
            return BottomContainer:new{
                dimen = Geom:new{ w = card_w, h = title_h },
                title_widget,
            }
        end
        for row_start = 1, #books, columns do
            local row = HorizontalGroup:new{ align = "top" }
            local row_count = math.min(columns, #books - row_start + 1)
            for i = row_start, row_start + row_count - 1 do
                local fp = books[i]
                local bd = SH.getBookData(fp, ctx.prefetched and ctx.prefetched[fp])
                local cover = SH.getBookCover(fp, d.RECENT_W, d.RECENT_H, nil, 0.10)
                    or SH.coverPlaceholder(bd.title, bd.authors, d.RECENT_W, d.RECENT_H)
                local cover_box = CenterContainer:new{
                    dimen = Geom:new{ w = card_w, h = d.RECENT_H },
                    cover,
                }
                local cell = VerticalGroup:new{
                    align = "center",
                    cover_box,
                    SH.vspan(gap_y, ctx.vspan_pool),
                    titleBox(bd.title),
                }
                if show_bar then
                    cell[#cell + 1] = SH.vspan(gap_y, ctx.vspan_pool)
                    cell[#cell + 1] = UI.progressBar(card_w, bd.percent, d.RB_BAR_H)
                end
                if show_pct then
                    cell[#cell + 1] = SH.vspan(gap_y, ctx.vspan_pool)
                    cell[#cell + 1] = UI.makeColoredText{
                        text = SH.pctStr(bd.percent),
                        face = pct_face,
                        bold = true,
                        fgcolor = secondary,
                        width = card_w,
                        alignment = "center",
                    }
                end

                local tappable = InputContainer:new{
                    dimen = Geom:new{ w = card_w, h = cell_h },
                    [1] = cell,
                    _fp = fp,
                    _open_fn = ctx.open_fn,
                }
                tappable.ges_events = { TapBook = { GestureRange:new{
                    ges = "tap", range = function() return tappable.dimen end,
                } } }
                function tappable:onTapBook()
                    if self._open_fn then self._open_fn(self._fp) end
                    return true
                end

                if i > row_start then
                    row[#row + 1] = HorizontalSpan:new{ width = column_gap }
                end
                row[#row + 1] = tappable
                cover_slots[#cover_slots + 1] = {
                    container = cover_box, idx = 1, fp = fp,
                    w = d.RECENT_W, h = d.RECENT_H, align = nil, stretch = 0.10,
                }
            end
            if #rows > 0 then rows[#rows + 1] = SH.vspan(row_gap, ctx.vspan_pool) end
            rows[#rows + 1] = LeftContainer:new{
                dimen = Geom:new{ w = inner_w, h = cell_h },
                row,
            }
        end

        local result = FrameContainer:new{
            bordersize = 0,
            padding = PAD,
            padding_top = top_gap,
            padding_bottom = 0,
            rows,
        }
        result._cover_slots = cover_slots
        return result
    end

    function Recent.getHeight(ctx)
        local d, _, _, title_h, gap_y, top_gap = dimensions(ctx)
        local pfx = ctx and ctx.pfx or ""
        local _, _, _, columns, row_gap = layoutProfile()
        local book_count = #visibleBooks(ctx or {})
        local row_count = math.max(1, math.ceil(book_count / columns))
        local cell_h = d.RECENT_H + gap_y + title_h
        if SUISettings:get(pfx .. "recent_show_progress") == true then
            cell_h = cell_h + gap_y + d.RB_BAR_H
        end
        if SUISettings:get(pfx .. "recent_show_text") ~= false then
            cell_h = cell_h + gap_y + d.RB_LABEL_H
        end
        local h = cell_h * row_count + row_gap * (row_count - 1)
        return Config.getScaledLabelH() + top_gap + h
    end

    -- Titles can change with metadata and the responsive book count can change
    -- with orientation, so a complete lightweight module rebuild is safest.
    function Recent.updateStats() return false end
    Recent._books_resume_home_applied = true
    return true
end

return M
