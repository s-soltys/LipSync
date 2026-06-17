package avatar3D.expression 
{
	/**
	 * ...
	 * @author S
	 */
	public class ExpressionsCollection
	{
		public static var visemes:Array;
		
		public static var NEUTRAL:AvatarExpression;
		public static var JOY:AvatarExpression;
		public static var SADNESS:AvatarExpression;
		public static var ANGER:AvatarExpression;
		public static var FEAR:AvatarExpression;
		public static var DISGUST:AvatarExpression;
		public static var SURPRISE:AvatarExpression;
		
		
		public static function initCollection(xml:XMLList):void {
			NEUTRAL = new AvatarExpression(xml.emotions.neutral);
			JOY = new AvatarExpression(xml.emotions.joy);
			SADNESS = new AvatarExpression(xml.emotions.sadness);
			ANGER = new AvatarExpression(xml.emotions.anger);
			FEAR = new AvatarExpression(xml.emotions.fear);
			DISGUST = new AvatarExpression(xml.emotions.disgust);
			SURPRISE = new AvatarExpression(xml.emotions.surprise);
			
			visemes = new Array();
			var visemesXML:XMLList = xml.visemes;
			for each(var v:XML in visemesXML.children()) {
				var viseme:AvatarExpression = new AvatarExpression(v);
				visemes.push(viseme);
			}
		}
		
		public static function combine(viseme:AvatarExpression, expression:AvatarExpression):AvatarExpression {
			var combined:AvatarExpression = null;
			
			return combined;
		}
		
		public static function getVisemeByAlias(alias:String):AvatarExpression {
			for each(var viseme:AvatarExpression in visemes) {
				if (viseme.alias == alias) return viseme;
			}
			return NEUTRAL;
		}
		
		public static function getVisemeById(id:int):AvatarExpression {
			for each(var viseme:AvatarExpression in visemes) {
				if (viseme.id == id) return viseme;
			}
			return NEUTRAL;
		}
		
	}
}