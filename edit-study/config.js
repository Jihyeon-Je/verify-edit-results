// The Google Apps Script web app that writes answers to the response spreadsheet: the category study's endpoint
// (human_study/setup/apps_script.gs), reused. Each pair is one row in its "responses" tab, told apart by the study column:
// class = the pair id (q01..q40), class_name = the class shown, property_1 = the answer (A, B or same), property_2 = the
// medium (svg or blender), reorders = how many times the answer was changed, first_view_seconds = seconds to the first
// answer, seconds = time on the pair. Which side is which method is in key.json, which is not published.
window.STUDY_CONFIG = {
  SUBMIT_URL: "https://script.google.com/macros/s/AKfycbz9vFTyjYZDZEp82h8WxGvcFIycT5fYLrNCXyt1eqw-00YVSjdWVzS7hteFPoJz-1CQeg/exec",
  STUDY: "edit-ab-v1"
};
