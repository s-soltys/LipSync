package avatar3D.face.mouth 
{
	import avatar3D.core.AvatarFeature;
	import avatar3D.expression.AvatarExpression;
	import avatar3D.expression.ExpressionsCollection;
	import away3d.containers.ObjectContainer3D;
	/**
	 * ...
	 * @author S
	 */
	public class AvatarMouth
	{
		public var jaw:AvatarFeature;
		public var tongue:AvatarFeature;
		public var mouth_r:AvatarFeature;
		public var mouth_l:AvatarFeature;
		public var lip_down_r:AvatarFeature;
		public var lip_down_m:AvatarFeature;
		public var lip_down_l:AvatarFeature;
		public var lip_top_r:AvatarFeature;
		public var lip_top_m:AvatarFeature;
		public var lip_top_l:AvatarFeature;
		public var cheek_r:AvatarFeature;
		public var cheek_l:AvatarFeature;
		public var cheekb_r:AvatarFeature;
		public var cheekb_l:AvatarFeature;
		
		public function AvatarMouth(avatar:ObjectContainer3D, xml:XMLList) {
			jaw = new AvatarFeature(avatar, xml.jaw);
			tongue = new AvatarFeature(avatar, xml.tongue);
			mouth_r = new AvatarFeature(avatar, xml.mouth_r);
			mouth_l = new AvatarFeature(avatar, xml.mouth_l);
			lip_down_r = new AvatarFeature(avatar, xml.lip_down_r);
			lip_down_m = new AvatarFeature(avatar, xml.lip_down_m);
			lip_down_l = new AvatarFeature(avatar, xml.lip_down_l);
			lip_top_r = new AvatarFeature(avatar, xml.lip_top_r);
			lip_top_m = new AvatarFeature(avatar, xml.lip_top_m);
			lip_top_l = new AvatarFeature(avatar, xml.lip_top_l);
			cheek_r = new AvatarFeature(avatar, xml.cheek_r);
			cheek_l = new AvatarFeature(avatar, xml.cheek_l);
			cheekb_r = new AvatarFeature(avatar, xml.cheekb_r);
			cheekb_l = new AvatarFeature(avatar, xml.cheekb_l);
		}
		
		public function smile(value:Number):void {
			mouth_r.movY.value = -value;
			mouth_l.movY.value = -value;
		}
		
		public function setViseme(value:Number, viseme:AvatarExpression):void {
			jaw.setParameter(value, viseme.jaw);
			tongue.setParameter(value, viseme.tongue);
			mouth_l.setParameter(value, viseme.mouth_l);
			mouth_r.setParameter(value, viseme.mouth_r);
			lip_down_l.setParameter(value, viseme.lip_down_l);
			lip_down_m.setParameter(value, viseme.lip_down_m);
			lip_down_r.setParameter(value, viseme.lip_down_r);
			lip_top_l.setParameter(value, viseme.lip_top_l);
			lip_top_m.setParameter(value, viseme.lip_top_m);
			lip_top_r.setParameter(value, viseme.lip_top_r);
			cheek_l.setParameter(value, viseme.cheek_l);
			cheek_r.setParameter(value, viseme.cheek_r);
			cheekb_l.setParameter(value, viseme.cheekb_l);
			cheekb_r.setParameter(value, viseme.cheekb_r);
		}
		
		public function setNeutral(time:Number):void {
			var value:Number = 1.0;
			var viseme:AvatarExpression = ExpressionsCollection.NEUTRAL;
			
			jaw.setParameterTween(value, viseme.jaw, time);
			tongue.setParameterTween(value, viseme.tongue, time);
			mouth_l.setParameterTween(value, viseme.mouth_l, time);
			mouth_r.setParameterTween(value, viseme.mouth_r, time);
			lip_down_l.setParameterTween(value, viseme.lip_down_l, time);
			lip_down_m.setParameterTween(value, viseme.lip_down_m, time);
			lip_down_r.setParameterTween(value, viseme.lip_down_r, time);
			lip_top_l.setParameterTween(value, viseme.lip_top_l, time);
			lip_top_m.setParameterTween(value, viseme.lip_top_m, time);
			lip_top_r.setParameterTween(value, viseme.lip_top_r, time);
			cheek_l.setParameterTween(value, viseme.cheek_l, time);
			cheek_r.setParameterTween(value, viseme.cheek_r, time);
			cheekb_l.setParameterTween(value, viseme.cheekb_l, time);
			cheekb_r.setParameterTween(value, viseme.cheekb_r, time);
		}
		
	}
}